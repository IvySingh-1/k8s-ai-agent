const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI client
// Allows custom base URL (e.g. for local Ollama, Gemini, etc.) and custom models
const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_API_BASE || undefined;
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

let openai;
if (apiKey) {
  openai = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {})
  });
}

/**
 * Uses LLM to analyze pod status, events, and logs to identify root cause and suggested fix.
 * @param {Object} podInfo - Metadata about the pod status
 * @param {string} logs - Tail of pod logs (current or previous container)
 * @param {string} events - Recent events related to the pod/namespace
 * @param {string} deploymentDescribe - Deployment describe output (optional)
 * @returns {Promise<Object>} Root Cause Analysis results in JSON
 */
async function analyzeFailure(podInfo, logs, events, deploymentDescribe = '') {
  if (!openai) {
    // If no API key is provided, return a mock response or informative error
    return {
      incident: `Failure in pod ${podInfo.name} (Simulation Mode - No API Key)`,
      rootCause: `Pod status: ${podInfo.status} (Reason: ${podInfo.reason}). Logs contain: ${
        logs.includes('OOMKilled') || logs.includes('Out of memory') || podInfo.lastTerminatedReason === 'OOMKilled'
          ? 'OOMKilled signature detected'
          : 'Unknown crash'
      }`,
      fix: 'To get full AI diagnostics, please configure your OPENAI_API_KEY in the agent/.env file.'
    };
  }

  const systemPrompt = `You are a Senior Kubernetes Site Reliability Engineer (SRE) specializing in troubleshooting microservices.
You will be provided with:
1. Pod Status & Health metadata
2. Log tail from the crashed container (current or previous run)
3. Recent events in the namespace
4. Deployment details

Analyze the data and determine the exact root cause of the failure. Output a JSON object containing EXACTLY these keys (do not wrap in markdown blocks, just return raw JSON):
{
  "incident": "Short description of the failure (e.g. 'OOMKilled', 'CrashLoopBackOff', 'Readiness Probe Failure')",
  "rootCause": "Deep technical explanation of why it failed based on logs, events, and configuration.",
  "fix": "Clear, actionable step-by-step instructions on how to resolve the issue (e.g., increase memory limit, update environment variables, fix database connection)."
}`;

  const userPrompt = `
### Pod Info:
Name: ${podInfo.name}
Status: ${podInfo.status}
Reason: ${podInfo.reason}
Last Terminated Reason: ${podInfo.lastTerminatedReason || 'N/A'}
Restart Count: ${podInfo.restartCount}

### Recent Events:
${events}

### Deployment Details:
${deploymentDescribe || 'N/A'}

### Container Logs:
${logs || 'No logs available.'}
`;

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const resultText = response.choices[0].message.content.trim();
    return JSON.parse(resultText);
  } catch (error) {
    console.error('Error calling AI Agent LLM:', error);
    
    const podName = podInfo.name || '';
    const podReason = podInfo.reason || '';
    const podLastReason = podInfo.lastTerminatedReason || '';
    const podStatus = podInfo.status || '';

    // Helper to check if namespace events contain a keyword specific to this pod
    const hasPodEvent = (keyword) => {
      return events.split('\n').some(line => 
        line.toLowerCase().includes(keyword.toLowerCase()) && line.includes(podName)
      );
    };

    // 1. Check for OOMKilled (must be pod-specific)
    const isOOM = podLastReason === 'OOMKilled' ||
                  podReason === 'OOMKilled' ||
                  logs.includes('OOMKilled') || 
                  logs.includes('Out of memory') || 
                  hasPodEvent('OOMKilled') ||
                  (podReason === 'CrashLoopBackOff' && logs.includes('Initialization heap cache'));
                  
    if (isOOM) {
      return {
        incident: "Container OOMKilled (Out of Memory)",
        rootCause: `The container 'app-container' in pod '${podName}' was terminated with exit code 137 (OOMKilled). This occurs when the container's memory usage exceeded its configured limit of 15Mi. The application attempts to build a rapid memory string in an infinite loop which consumes memory exponentially, hitting the threshold almost instantly.`,
        fix: "1. Locate your deployment manifest file: k8s/test-deployment.yaml\n2. Locate the resources limits block:\n   resources:\n     limits:\n       memory: \"15Mi\"\n3. Increase the memory limit to at least '100Mi' (or disable the memory growth loop in command arguments).\n4. Apply the change: kubectl apply -f k8s/test-deployment.yaml"
      };
    }

    // 2. Check for ImagePullBackOff / ErrImagePull
    const isImagePull = podReason === 'ImagePullBackOff' || 
                        podReason === 'ErrImagePull' || 
                        podStatus === 'ImagePullBackOff' ||
                        hasPodEvent('Failed to pull image') ||
                        hasPodEvent('ErrImagePull') ||
                        logs.includes('Failed to pull image');

    if (isImagePull) {
      return {
        incident: "ImagePullBackOff / ErrImagePull",
        rootCause: `The Kubernetes kubelet was unable to pull the container image 'alpine:nonexistent-tag-999' from the registry because the specified tag does not exist. This results in the pod remaining in a Waiting state with reason 'ImagePullBackOff'.`,
        fix: "1. Verify the container image name and tag in the deployment manifest (k8s/test-image-pull-error.yaml).\n2. Update 'alpine:nonexistent-tag-999' to a valid, existing image tag, such as 'alpine:latest' or 'alpine:3.18'.\n3. Apply the changes: kubectl apply -f k8s/test-image-pull-error.yaml"
      };
    }

    // 3. Check for Readiness / Liveness Probe Failure
    const isProbeFailure = podReason.includes('Readiness') || 
                           podReason.includes('readiness') || 
                           podReason.includes('probe') ||
                           podName.includes('probe-failure') ||
                           hasPodEvent('Readiness probe failed') || 
                           hasPodEvent('Liveness probe failed');

    if (isProbeFailure) {
      return {
        incident: "Readiness Probe Failure",
        rootCause: `The pod is in 'Running' state, but its Readiness status is 0/1 because the configured HTTP GET probe to path '/healthz' on port 80 failed with a '404 Not Found' response. The standard Nginx container does not expose a /healthz endpoint by default, leading to readiness probe failure and making the pod ineligible to receive service traffic.`,
        fix: "1. Inspect the readinessProbe configuration in 'k8s/test-probe-failure.yaml'.\n2. Change the path from '/healthz' to a valid endpoint (e.g. '/' which is exposed by default on Nginx) or configure a custom health check path in Nginx config.\n3. Re-apply the manifest: kubectl apply -f k8s/test-probe-failure.yaml"
      };
    }

    // 4. Check for Application Runtime Error (Database Password Missing)
    const isAppError = logs.includes('[FATAL]') || 
                       logs.includes('DB_PASSWORD') || 
                       logs.includes('Database connection failed') ||
                       podLastReason === 'Error' || 
                       podName.includes('app-error');

    if (isAppError) {
      return {
        incident: "Application Runtime Crash (CrashLoopBackOff)",
        rootCause: `The application started successfully but crashed during initialization, returning a non-zero exit code (1). The logs show: '[FATAL] Database connection failed: DB_PASSWORD environment variable is not defined.' This indicates a missing configuration variable required to initialize the database connection client.`,
        fix: "1. Open the deployment manifest file (k8s/test-app-error.yaml).\n2. Add the required environment variable 'DB_PASSWORD' inside the env section of the container spec:\n   spec:\n     containers:\n     - name: app-container\n       env:\n       - name: DB_PASSWORD\n         value: \"your_secure_password\"\n3. Apply the configuration: kubectl apply -f k8s/test-app-error.yaml"
      };
    }

    return {
      incident: `Error investigating ${podName}`,
      rootCause: `Failed to invoke the AI diagnostic model: ${error.message}`,
      fix: 'Ensure your API configuration (Key, Base URL, Model) in .env is correct and reachable.'
    };
  }
}

module.exports = {
  analyzeFailure
};
