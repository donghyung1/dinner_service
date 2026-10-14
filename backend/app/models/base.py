from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase

BigIntId = mysql.BIGINT(unsigned=True)
TinyUInt = mysql.TINYINT(unsigned=True)


class Base(DeclarativeBase):
    pass
