
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

# Installs the Python dependencies (Numpy, FastAPI, Groq, ElevenLabs)
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose port 8002 for the React WebSockets
EXPOSE 8002

CMD ["uvicorn", "Main:app", "--host", "0.0.0.0", "--port", "8002"]