# AI Kubernetes Health Investigator

An AI-powered Kubernetes agent that automatically investigates cluster failures, parses logs and event lists, and uses LLMs to generate explainable root-cause recommendations (RCA) and mitigation fixes.

## Project Structure
- `collector/`: Node.js scripts to fetch cluster health, pod status, logs, and events via `kubectl`.
- `agent/`: AI engine utilizing OpenAI SDK to parse cluster diagnostics and generate RCAs.
- `app/`: Express.js backend API exposing status and investigation endpoints.
- `dashboard/`: Next.js web application showcasing cluster health and active diagnostics.
- `k8s/`: Local Kubernetes manifests to inject failures for demo testing.

## Prerequisites
- Node.js (v18+)
- Docker & Kubernetes (Docker Desktop, Minikube, or Kind)
- OpenAI API Key (or compatible model endpoints)
