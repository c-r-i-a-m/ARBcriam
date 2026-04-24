FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Seed on first run if DB doesn't exist
RUN python -c "from database import engine, Base; import models; Base.metadata.create_all(bind=engine)"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
