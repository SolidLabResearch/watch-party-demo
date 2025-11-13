# Multi-stage build for Aggregator service
FROM golang:1.22-alpine AS build
WORKDIR /app
# Install CA certificates (for HTTPS requests at runtime)
RUN apk add --no-cache ca-certificates git

# Copy aggregator source
COPY aggregator/ ./aggregator/
WORKDIR /app/aggregator

# Download dependencies and build
RUN go mod download
RUN go build -o /app/server .

# Runtime image
FROM alpine:3.19
WORKDIR /app
RUN apk add --no-cache ca-certificates && update-ca-certificates
COPY --from=build /app/server /app/server
EXPOSE 5000
ENTRYPOINT ["/app/server"]
