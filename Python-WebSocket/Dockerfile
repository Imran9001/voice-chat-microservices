
FROM python:3.11-slim

# Sets the working directory inside the container
WORKDIR /app

COPY requirements.txt .

#Installs the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copies the rest of the Python source code (Main.py, auth.py, connectionManager.py)
COPY . .

EXPOSE 8000

# Boots up the Uvicorn server
CMD ["uvicorn", "Main:app", "--host", "0.0.0.0", "--port", "8000"]