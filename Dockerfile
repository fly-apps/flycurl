FROM hayd/debian-deno:1.6.0
RUN apt-get update && apt-get install -yq curl && apt-get clean && rm -rf /var/lib/apt/lists

ENV PORT=8080
EXPOSE 8080
WORKDIR /app
USER deno
COPY main.ts deps.* ./
RUN /bin/bash -c "deno cache deps.ts || true"
ADD . .
RUN deno cache main.ts

CMD ["run", "--allow-env", "--allow-net", "--allow-run", "main.ts"]