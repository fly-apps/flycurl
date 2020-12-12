FROM hayd/deno:alpine-1.6.0
RUN apk update && apk add --no-cache curl bind-tools

ENV PORT=8080
EXPOSE 8080
WORKDIR /app
USER deno
COPY main.ts deps.* ./
RUN /bin/sh -c "deno cache deps.ts || true"
ADD . .
RUN deno cache main.ts

CMD ["run", "--allow-env", "--allow-net", "--allow-run", "main.ts"]