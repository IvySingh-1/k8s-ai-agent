const { exec } = require('child_process');

/**
 * Fetches recent events in a namespace and formats them.
 * @param {string} namespace - Target namespace (default: 'default')
 * @returns {Promise<string>} Formatted string of recent events
 */
function getEvents(namespace = 'default') {
  return new Promise((resolve) => {
    exec(`kubectl get events -n ${namespace} --sort-by='.metadata.creationTimestamp' -o json`, (error, stdout, stderr) => {
      if (error) {
        return resolve(`Failed to fetch events: ${stderr.trim() || error.message}`);
      }
      try {
        const data = JSON.parse(stdout);
        if (!data.items || data.items.length === 0) {
          return resolve('No events found.');
        }
        // Take the last 15 events
        const recentEvents = data.items.slice(-15).map(e => {
          const timestamp = e.lastTimestamp || e.eventTime || 'Unknown';
          const type = e.type || 'Normal';
          const reason = e.reason || 'Unknown';
          const object = e.involvedObject ? `${e.involvedObject.kind}/${e.involvedObject.name}` : 'Unknown';
          const message = e.message || '';
          return `[${timestamp}] ${type} - Reason: ${reason} on ${object} - ${message}`;
        });
        resolve(recentEvents.join('\n'));
      } catch (err) {
        resolve(`Failed to parse events JSON: ${err.message}. Raw output: ${stdout.slice(0, 500)}`);
      }
    });
  });
}

/**
 * Runs describe on a deployment to inspect metadata, replicas, and strategy.
 * @param {string} deploymentName - Name of the deployment
 * @param {string} namespace - Target namespace (default: 'default')
 * @returns {Promise<string>} Describe stdout
 */
function getDeploymentDescribe(deploymentName, namespace = 'default') {
  return new Promise((resolve) => {
    exec(`kubectl describe deployment ${deploymentName} -n ${namespace}`, (error, stdout, stderr) => {
      if (error) {
        return resolve(`Failed to describe deployment: ${stderr.trim() || error.message}`);
      }
      resolve(stdout);
    });
  });
}

/**
 * Lists deployments in a namespace.
 * @param {string} namespace - Target namespace (default: 'default')
 * @returns {Promise<Array>} List of deployments and status summary
 */
function getDeployments(namespace = 'default') {
  return new Promise((resolve) => {
    exec(`kubectl get deployments -n ${namespace} -o json`, (error, stdout, stderr) => {
      if (error) {
        return resolve([]);
      }
      try {
        const data = JSON.parse(stdout);
        return resolve(data.items.map(d => ({
          name: d.metadata.name,
          replicas: d.status.replicas || 0,
          readyReplicas: d.status.readyReplicas || 0,
          updatedReplicas: d.status.updatedReplicas || 0,
          unavailableReplicas: d.status.unavailableReplicas || 0,
          creationTimestamp: d.metadata.creationTimestamp
        })));
      } catch (e) {
        return resolve([]);
      }
    });
  });
}

/**
 * Attempts to resolve the deployment name that owns a given pod.
 * Pod -> ReplicaSet -> Deployment
 * @param {string} podName - Name of the pod
 * @param {string} namespace - Target namespace (default: 'default')
 * @returns {Promise<string|null>} Resolved deployment name or null
 */
function getDeploymentNameForPod(podName, namespace = 'default') {
  return new Promise((resolve) => {
    exec(`kubectl get pod ${podName} -n ${namespace} -o json`, (error, stdout) => {
      if (error) return resolve(null);
      try {
        const pod = JSON.parse(stdout);
        const owners = pod.metadata.ownerReferences || [];
        const replicaSetOwner = owners.find(o => o.kind === 'ReplicaSet');
        if (!replicaSetOwner) return resolve(null);
        
        const replicaSetName = replicaSetOwner.name;
        exec(`kubectl get replicaset ${replicaSetName} -n ${namespace} -o json`, (rsError, rsStdout) => {
          if (rsError) {
            // Fallback: Guess by splitting replica set name
            const parts = replicaSetName.split('-');
            parts.pop(); // Remove the replica set template hash
            return resolve(parts.join('-'));
          }
          try {
            const rs = JSON.parse(rsStdout);
            const rsOwners = rs.metadata.ownerReferences || [];
            const deployOwner = rsOwners.find(o => o.kind === 'Deployment');
            if (deployOwner) {
              return resolve(deployOwner.name);
            }
            // Fallback guess
            const parts = replicaSetName.split('-');
            parts.pop();
            return resolve(parts.join('-'));
          } catch (e) {
            const parts = replicaSetName.split('-');
            parts.pop();
            return resolve(parts.join('-'));
          }
        });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

module.exports = {
  getEvents,
  getDeploymentDescribe,
  getDeployments,
  getDeploymentNameForPod
};
