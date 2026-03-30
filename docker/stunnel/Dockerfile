FROM alpine:3.21

RUN apk add --no-cache bash stunnel

COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
