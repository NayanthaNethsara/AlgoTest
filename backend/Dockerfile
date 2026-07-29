# Local dev image for the backend.
#
# The /run sandbox uses isolate, which needs a Linux host with cgroup v2, so the
# server cannot run natively on macOS. This image gives it that host: isolate
# plus the language toolchains, matching what deploy/provision-isolate.sh
# installs on a real server.
#
# isolate's manual advises against containers (cgroup delegation is the
# container manager's to get right, and sharing a machine skews timing). That
# tradeoff is fine for development but not for production or for timing runs --
# provision a real Linux host for those.

FROM ubuntu:24.04

ARG GO_VERSION=1.25.7
ARG ISOLATE_REF=v2.1

ENV DEBIAN_FRONTEND=noninteractive

# Toolchain versions match the server environment: g++ 13, JDK 21, Python 3.12.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git make pkg-config \
        libcap-dev libseccomp-dev libsystemd-dev \
        g++-13 openjdk-21-jdk-headless python3.12 \
    && rm -rf /var/lib/apt/lists/* \
    && update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-13 100 \
    && update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-13 100 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 100

RUN git clone --depth 1 --branch ${ISOLATE_REF} https://github.com/ioi/isolate /tmp/isolate \
    && make -C /tmp/isolate isolate \
    && make -C /tmp/isolate install \
    && rm -rf /tmp/isolate

RUN arch="$(dpkg --print-architecture)" \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${arch}.tar.gz" \
       | tar -C /usr/local -xz
ENV PATH=/usr/local/go/bin:/go/bin:$PATH
ENV GOPATH=/go GOCACHE=/go/cache

WORKDIR /app
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["go", "run", "./cmd/server"]
