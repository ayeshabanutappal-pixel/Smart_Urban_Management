from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

# Unbound extension instances initialized inside the application factory.
db = SQLAlchemy()
migrate = Migrate()
cors = CORS()
jwt = JWTManager()

