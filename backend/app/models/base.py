from sqlalchemy import Integer, SmallInteger
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase

# MariaDB에서는 UNSIGNED 타입, SQLite(테스트)에서는 일반 정수로 매핑한다.
BigIntId = mysql.BIGINT(unsigned=True).with_variant(Integer, "sqlite")
TinyUInt = mysql.TINYINT(unsigned=True).with_variant(SmallInteger, "sqlite")


class Base(DeclarativeBase):
    pass
