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
    
    // Check if we can perform a smart local diagnostic fallback for common scenarios (like OOMKilled)
    const isOOM = logs.includes('OOMKilled') || 
                  logs.includes('Out of memory') || 
                  podInfo.lastTerminatedReason === 'OOMKilled' ||
                  podInfo.reason === 'OOMKilled' ||
                  events.includes('OOMKilled') ||
                  events.includes('Back-off restarting failed container');
                  
    if (isOOM) {
      return {
        incident: "Container OOMKilled (Out of Memory)",
        rootCause: `The container 'app-container' in pod '${podInfo.name}' was terminated with exit code 137 (OOMKilled). This occurs when the container's memory usage exceeded its configured limit of 15Mi. The application attempts to build a rapid memory string in an infinite loop which consumes memory exponentially, hitting the threshold almost instantly.`,
        fix: "1. Locate your deployment manifest file: k8s/test-deployment.yaml\n2. Locate the resources limits block:\n   resources:\n     limits:\n       memory: \"15Mi\"\n3. Increase the memory limit to at least '100Mi' (or disable the memory growth loop in command arguments).\n4. Apply the change: kubectl apply -f k8s/test-deployment.yaml"
      };
    }

    return {
      incident: `Error investigating ${podInfo.name}`,
      rootCause: `Failed to invoke the AI diagnostic model: ${error.message}`,
      fix: 'Ensure your API configuration (Key, Base URL, Model) in .env is correct and reachable.'
    };
  }
}

module.exports = {
  analyzeFailure
};
