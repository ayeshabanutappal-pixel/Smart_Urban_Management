import re
import click
from flask import Flask
from flask.cli import with_appcontext

from app.extensions import db
from app.models.user import User

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def register_cli_commands(app: Flask) -> None:
    """Register secure administrative CLI commands."""

    @app.cli.command("create-admin")
    @click.option("--name", prompt="Admin full name", help="Full name of the administrator.")
    @click.option("--email", prompt="Admin email", help="Email address for the admin account.")
    @click.option(
        "--password",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
        help="Password (minimum 8 characters).",
    )
    @click.option("--phone", default="", help="Optional phone number.")
    @click.option("--ward", default="Central Municipal Operations", help="Assigned office/ward.")
    @with_appcontext
    def create_admin(name: str, email: str, password: str, phone: str, ward: str) -> None:
        """Provision a municipal admin account securely via CLI (never via public signup)."""
        clean_name = name.strip()
        clean_email = email.strip().lower()

        if len(clean_name) < 2:
            raise click.BadParameter("Admin name must be at least 2 characters.")
        if not EMAIL_REGEX.match(clean_email):
            raise click.BadParameter("Please enter a valid email address.")
        if len(password) < 8:
            raise click.BadParameter("Admin password must be at least 8 characters.")

        existing = User.query.filter_by(email=clean_email).first()
        if existing is not None:
            raise click.ClickException(
                f"A user with email '{clean_email}' already exists (role={existing.role})."
            )

        admin_user = User(
            name=clean_name,
            email=clean_email,
            role="admin",
            phone=phone.strip(),
            ward=ward.strip(),
        )
        admin_user.set_password(password)

        db.session.add(admin_user)
        db.session.commit()

        click.echo(f"Admin account created successfully: {admin_user.email} (id={admin_user.id})")

    # ------------------------------------------------------------------
    # flask init-admin
    # Idempotent provisioning of the default municipal administrator
    # account.  Reads credentials from environment variables so that
    # plaintext passwords are never stored in source files.
    #
    # Required env vars (set in backend/.env):
    #   ADMIN_EMAIL    — defaults to admin@wastesmart.com
    #   ADMIN_PASSWORD — defaults to WasteSmart@Admin2026
    #   ADMIN_NAME     — defaults to Municipal Administrator
    # ------------------------------------------------------------------
    @app.cli.command("init-admin")
    @with_appcontext
    def init_admin() -> None:
        """Idempotently provision the default municipal administrator account.

        Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from the environment
        (or falls back to defaults).  If the account already exists the
        command exits successfully without modifying the existing record.
        Only bcrypt hashes are written to the database — the plaintext
        password is never persisted.
        """
        import os

        admin_email = (os.getenv("ADMIN_EMAIL") or "admin@wastesmart.com").strip().lower()
        admin_password = (os.getenv("ADMIN_PASSWORD") or "WasteSmart@Admin2026").strip()
        admin_name = (os.getenv("ADMIN_NAME") or "Municipal Administrator").strip()
        admin_phone = (os.getenv("ADMIN_PHONE") or "").strip()
        admin_ward = (os.getenv("ADMIN_WARD") or "Central Municipal Operations").strip()

        if len(admin_password) < 8:
            raise click.ClickException(
                "ADMIN_PASSWORD must be at least 8 characters. "
                "Set a secure value in backend/.env."
            )
        if not EMAIL_REGEX.match(admin_email):
            raise click.ClickException(
                f"ADMIN_EMAIL '{admin_email}' is not a valid email address."
            )

        existing = User.query.filter_by(email=admin_email).first()
        if existing is not None:
            if existing.role != "admin":
                raise click.ClickException(
                    f"A non-admin user with email '{admin_email}' already exists "
                    f"(role={existing.role}). Remove that account first."
                )
            click.echo(
                f"[init-admin] Admin account already exists: {existing.email} "
                f"(id={existing.id}) — no changes made."
            )
            return

        admin_user = User(
            name=admin_name,
            email=admin_email,
            role="admin",
            phone=admin_phone,
            ward=admin_ward,
        )
        admin_user.set_password(admin_password)

        db.session.add(admin_user)
        db.session.commit()

        click.echo(
            f"[init-admin] Administrator account provisioned: {admin_user.email} "
            f"(id={admin_user.id}). Password stored as bcrypt hash."
        )

