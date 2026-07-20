#!/bin/bash
set -e

VERSION=${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo "latest")}
echo "Deploying version: $VERSION"

docker build -t gravityclaw:$VERSION .
docker tag gravityclaw:$VERSION registry.gravityclaw.io/gravityclaw:$VERSION
docker push registry.gravityclaw.io/gravityclaw:$VERSION

docker stack deploy -c docker-compose.prod.yml gravityclaw --with-registry-auth

echo "Waiting for rollout..."
sleep 30

curl -f http://localhost:3000/api/live || {
    echo "Deployment verification failed. Rolling back..."
    docker stack rollback gravityclaw
    exit 1
}

echo "Deployment successful: $VERSION"
