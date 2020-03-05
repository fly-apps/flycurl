FROM frolvlad/alpine-glibc:alpine-3.8

RUN apk add --no-cache curl

ARG DENO_VERSION=0.35.0
ARG SOURCE_DIR=.
ARG APP_DIR=/app
ARG ENTRY_FILE=server.ts

RUN curl -fsSL https://deno.land/x/install/install.sh | sh
RUN ln -sf /root/.local/bin/deno /bin/deno

COPY ${SOURCE_DIR} ${APP_DIR}

RUN deno install -d /bin fly-app "${APP_DIR}/${ENTRY_FILE}" --allow-env --allow-net --allow-run
CMD ["deno", "--allow-env", "--allow-net", "--allow-run", "/app/server.ts"]