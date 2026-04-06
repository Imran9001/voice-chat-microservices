
FROM golang:1.26-alpine AS builder

WORKDIR /app


COPY go.mod go.sum* ./

# Downloads all dependencies (like pion/webrtc) into the Docker cache
RUN go mod download


COPY . .

# Compiles the Go app into a standalone binary
RUN CGO_ENABLED=0 GOOS=linux go build -o webrtc-router main.go


FROM alpine:latest

WORKDIR /root/

# Copy the compiled binary
COPY --from=builder /app/webrtc-router .

# Exposes port 8081 for the React frontend
EXPOSE 8081

# Executes the binary
CMD ["./webrtc-router"]