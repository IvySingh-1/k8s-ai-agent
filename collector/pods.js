const { exec } = require('child_process');

/**
 * Fetches the list of pods in the specified namespace and parses their health status.
 * @param {string} namespace - The Kubernetes namespace (default: 'default')
 * @returns {Promise<Array>} List of pods with status and metadata
 */
function getPods(namespace = 'default') {
  return new Promise((resolve, reject) => {
    exec(`kubectl get pods -n ${namespace} -o json`, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to execute kubectl get pods: ${stderr || error.message}`));
      }
      try {
        const data = JSON.parse(stdout);
        const pods = data.items.map(item => {
          const name = item.metadata.name;
          const creationTimestamp = item.metadata.creationTimestamp;
          
          // Default status is the phase (Running, Pending, Succeeded, Failed, Unknown)
          let status = item.status.phase;
          let reason = '';
          let restartCount = 0;
          let lastTerminatedReason = '';

          if (item.status.containerStatuses && item.status.containerStatuses.length > 0) {
            // Check all containers (focusing on the first one or finding the failing one)
            const mainContainer = item.status.containerStatuses[0];
            restartCount = mainContainer.restartCount;

            // Check if the container is currently waiting (e.g. CrashLoopBackOff, ImagePullBackOff)
            if (mainContainer.state.waiting) {
              status = 'Waiting';
              reason = mainContainer.state.waiting.reason;
            } 
            // Check if the container is terminated (e.g. OOMKilled, Error)
            else if (mainContainer.state.terminated) {
              status = 'Terminated';
              reason = mainContainer.state.terminated.reason;
            }
            // If running but not ready
            else if (mainContainer.state.running && !mainContainer.ready) {
              status = 'NotReady';
              reason = 'Container running but failing readiness probe';
            }

            // Check last terminated state to find OOMKilled or previous crashes
            if (mainContainer.lastState && mainContainer.lastState.terminated) {
              lastTerminatedReason = mainContainer.lastState.terminated.reason;
            }
          }

          return {
            name,
            status,
            reason: reason || (status === 'Failed' ? 'Failed' : 'Running'),
            lastTerminatedReason,
            restartCount,
            creationTimestamp
          };
        });
        resolve(pods);
      } catch (err) {
        reject(new Error(`Failed to parse pod JSON output: ${err.message}`));
      }
    });
  });
}

module.exports = { getPods };
