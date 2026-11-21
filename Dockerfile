# One container for the whole app: builds the React front end, then runs FastAPI,
# which serves both the API (/api) and the built front end. Works on Render, Railway or Fly.

# 1) Build the front end
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Build with --build-arg VITE_DEMO_MODE=true for the judging demo (shows the fake-location testing tools)
ARG VITE_DEMO_MODE=false
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
RUN npm run build

# 2) Run the backend
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist ./static
ENV STATIC_DIR=/app/static
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
