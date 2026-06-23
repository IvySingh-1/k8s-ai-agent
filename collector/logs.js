const { exec } = require('child_process');

/**
 * Fetches logs for a given pod. Attempts to fall back to the previous container run
 * if the current one has crashed or is unreachable.
 * @param {string} podName - Name of the target pod
 * @param {string} namespace - Namespace of the pod (default: 'default')
 * @param {number} tailLines - Number of log lines to retrieve (default: 100)
 * @returns {Promise<string>} Pod logs or error message
 */
function getLogs(podName, namespace = 'default', tailLines = 100) {
  return new Promise((resolve) => {
    // Try to get logs from the current container run
    exec(`kubectl logs ${podName} -n ${namespace} --tail=${tailLines}`, (error, stdout, stderr) => {
      if (error) {
        // If current log retrieval fails (e.g. because container is restarting or crashed),
        // try fetching the logs of the previous crashed container run.
        exec(`kubectl logs ${podName} -n ${namespace} --previous --tail=${tailLines}`, (prevError, prevStdout, prevStderr) => {
          if (prevError) {
            return resolve(
              `[ERROR] Could not fetch current logs: ${stderr.trim() || error.message}\n` +
              `[ERROR] Could not fetch previous run logs: ${prevStderr.trim() || prevError.message}`
            );
          }
          resolve(`[PREVIOUS CONTAINER LOGS]\n${prevStdout}`);
        });
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = { getLogs };
