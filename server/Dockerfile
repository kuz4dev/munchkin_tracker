FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

FROM alpine:3.21

RUN apk --no-cache add ca-certificates \
    && adduser -D -H -u 10001 app

COPY --from=builder /server /server

# Run without root privileges: a compromised process can't touch the system.
USER app

EXPOSE 8080

CMD ["/server"]
