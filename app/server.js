const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from the agent/.env file
require('dotenv').config({ path: path.resolve(__dirname, '../agent/.env') });

const { getPods } = require('../collector/pods');
const { getLogs } = require('../collector/logs');
const { getEvents, getDeploymentDescribe, getDeploymentNameForPod } = require('../collector/deployments');
const { analyzeFailure } = require('../agent/index');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * GET /api/status
 * Returns aggregate cluster health status
 */
app.get('/api/status', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  try {
    const pods = await getPods(namespace);
    
    const running = pods.filter(p => p.status === 'Running').length;
    const pending = pods.filter(p => p.status === 'Pending' || p.status === 'Waiting').length;
    const failed = pods.filter(p => p.status === 'Failed' || p.status === 'Terminated' || p.reason === 'CrashLoopBackOff').length;
    
    res.json({
      status: failed > 0 ? 'Degraded' : 'Healthy',
      summary: {
        total: pods.length,
        running,
        pending,
        failed
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pods
 * Returns list of pods and their status details
 */
app.get('/api/pods', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  try {
    const pods = await getPods(namespace);
    res.json(pods);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/investigate/:podName
 * Triggers a deep AI-driven investigation on a failed pod
 */
app.get('/api/investigate/:podName', async (req, res) => {
  const { podName } = req.params;
  const namespace = req.query.namespace || 'default';

  try {
    // 1. Fetch all pods to get the target pod's status details
    const pods = await getPods(namespace);
    const podInfo = pods.find(p => p.name === podName);
    
    if (!podInfo) {
      return res.status(404).json({ error: `Pod '${podName}' not found in namespace '${namespace}'` });
    }

    // 2. Fetch logs (will auto fallback to previous container runs if crashed)
    const logs = await getLogs(podName, namespace);

    // 3. Fetch cluster events
    const events = await getEvents(namespace);

    // 4. Resolve deployment name and describe it
    let deploymentDescribe = '';
    const deploymentName = await getDeploymentNameForPod(podName, namespace);
    if (deploymentName) {
      deploymentDescribe = await getDeploymentDescribe(deploymentName, namespace);
    }

    // 5. Run AI Analysis
    const analysis = await analyzeFailure(podInfo, logs, events, deploymentDescribe);

    // Return full result including raw signals and AI recommendations
    res.json({
      podName,
      status: podInfo.status,
      reason: podInfo.reason,
      restartCount: podInfo.restartCount,
      deploymentName: deploymentName || 'Unknown',
      analysis,
      diagnostics: {
        events: events.split('\n'),
        logsExerpt: logs.slice(0, 2000) // limit size in response
      }
    });

  } catch (error) {
    console.error(`Failed to investigate pod ${podName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Kubernetes Health Backend running on port ${PORT}`);
});
