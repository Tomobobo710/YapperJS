// Global state
let serverStatus = 'stopped';
let logs = [];
let statusInterval;
let currentTab = 'control';

// DOM elements
const statusDisplay = document.getElementById('server-status');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const openChatBtn = document.getElementById('open-chat-btn');
const logsContainer = document.getElementById('logs-container');
const configForm = document.getElementById('server-config');
const testApiBtn = document.getElementById('test-api-btn');
const apiResponse = document.getElementById('api-response');
const apiEndpoint = document.getElementById('api-endpoint');
const apiRequest = document.getElementById('api-request');

// Modal elements
const modal = document.getElementById('modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalBtnOk = document.getElementById('modal-btn-ok');
const modalBtnCancel = document.getElementById('modal-btn-cancel');
const modalClose = document.getElementById('modal-close');

// Modal functions
function showModal(title, message, type = 'alert') {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    // Show/hide cancel button based on type
    if (type === 'confirm') {
        modalBtnCancel.style.display = 'inline-block';
        modalBtnOk.textContent = 'OK';
    } else {
        modalBtnCancel.style.display = 'none';
        modalBtnOk.textContent = 'OK';
    }
    
    modal.classList.add('active');
    modalOverlay.classList.add('active');
}

function hideModal() {
    modal.classList.remove('active');
    modalOverlay.classList.remove('active');
}

function showAlert(title, message) {
    return new Promise(resolve => {
        showModal(title, message, 'alert');
        const handler = () => {
            hideModal();
            resolve();
            modalBtnOk.removeEventListener('click', handler);
            modalClose.removeEventListener('click', handler);
        };
        modalBtnOk.addEventListener('click', handler);
        modalClose.addEventListener('click', handler);
    });
}

function showConfirm(title, message) {
    return new Promise(resolve => {
        showModal(title, message, 'confirm');
        const okHandler = () => {
            hideModal();
            resolve(true);
            cleanup();
        };
        const cancelHandler = () => {
            hideModal();
            resolve(false);
            cleanup();
        };
        const cleanup = () => {
            modalBtnOk.removeEventListener('click', okHandler);
            modalBtnCancel.removeEventListener('click', cancelHandler);
            modalClose.removeEventListener('click', cancelHandler);
        };
        modalBtnOk.addEventListener('click', okHandler);
        modalBtnCancel.addEventListener('click', cancelHandler);
        modalClose.addEventListener('click', cancelHandler);
    });
}

// Close modal when clicking overlay
modalOverlay.addEventListener('click', hideModal);

// Check for available models
async function checkAvailableModels() {
    try {
        const response = await fetch('/models');
        const models = await response.json();
        
        const modelSelect = document.getElementById('model');
        const modelsWarning = document.getElementById('models-warning');
        
        // Clear existing options (except the default one)
        modelSelect.innerHTML = '<option value="">-- Select a model --</option>';
        
        if (models.length === 0) {
            // No models found
            modelsWarning.style.display = 'block';
            startBtn.disabled = true;
            startBtn.title = 'Add .gguf model files to the models/ directory to start';
        } else {
            // Models found
            modelsWarning.style.display = 'none';
            startBtn.disabled = false;
            startBtn.title = '';
            
            // Populate model dropdown
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.path;
                option.textContent = `${model.name} (${formatFileSize(model.size)})`;
                modelSelect.appendChild(option);
            });
        }
        return true;
    } catch (error) {
        console.error('Error checking models:', error);
        return false;
    }
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    currentTab = tabName;
    
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Hide everything by default
    const controlPanel = document.querySelector('.control-panel');
    const apiPanel = document.querySelector('.api-panel');
    const logsTab = document.getElementById('logs-tab');
    
    controlPanel.style.display = 'none';
    apiPanel.style.display = 'none';
    logsTab.style.display = 'none';
    
    // Show the selected tab
    if (tabName === 'control') {
        controlPanel.style.display = 'block';
        apiPanel.style.display = 'block';
    } else if (tabName === 'logs') {
        logsTab.style.display = 'block';
        updateLogsDisplayFull();
    }
}

function updateLogsDisplayFull() {
    const logsContainer = document.getElementById('logs-container-full');
    logsContainer.innerHTML = '';

    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${log.type}`;
        logEntry.textContent = `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message.trim()}`;
        logsContainer.appendChild(logEntry);
    });

    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Initialize when dynamic UI is ready
document.addEventListener('dynamicUIReady', async () => {
    await checkAvailableModels();
    loadSavedConfig();
    updateCommandPreview();
    updateStatus();
    startStatusPolling();
    
    // Set up auto-save
    configForm.addEventListener('change', saveConfig);
    configForm.addEventListener('input', saveConfig);
    configForm.addEventListener('change', updateCommandPreview);
    configForm.addEventListener('input', updateCommandPreview);
});

// Start/stop server functions
startBtn.addEventListener('click', async () => {
    try {
        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="loading"></span> Starting...';

        const config = getFormValues();

        const response = await fetch('/start-server', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (response.ok) {
            await showAlert('Success', 'Server started successfully!');
            updateStatus();
        } else {
            await showAlert('Error', result.error);
        }
    } catch (error) {
        console.error('Error starting server:', error);
        await showAlert('Error', 'Error starting server: ' + error.message);
    } finally {
        startBtn.disabled = false;
        startBtn.innerHTML = 'Start Server';
    }
});

stopBtn.addEventListener('click', async () => {
     try {
         stopBtn.disabled = true;
         stopBtn.innerHTML = '<span class="loading"></span> Stopping...';

         const response = await fetch('/stop-server', {
             method: 'POST'
         });

         const result = await response.json();

         if (response.ok) {
             await showAlert('Success', 'Server stop signal sent!');
             updateStatus();
         } else {
             await showAlert('Error', result.error);
         }
     } catch (error) {
         console.error('Error stopping server:', error);
         await showAlert('Error', 'Error stopping server: ' + error.message);
     } finally {
         stopBtn.disabled = false;
         stopBtn.innerHTML = 'Stop Server';
     }
 });

 openChatBtn.addEventListener('click', () => {
     const port = document.getElementById('port').value || '5005';
     const host = document.getElementById('host').value || '127.0.0.1';
     const chatUrl = `http://${host}:${port}`;
     window.open(chatUrl, '_blank');
 });

// Update server status display
async function updateStatus() {
    try {
        const response = await fetch('/server-status');
        const data = await response.json();

        serverStatus = data.status;
        logs = data.logs || [];

        // Update status display
        statusDisplay.textContent = serverStatus.toUpperCase();
        statusDisplay.className = `status ${serverStatus}`;

        // Update button states
         startBtn.disabled = serverStatus === 'running' || serverStatus === 'starting';
         stopBtn.disabled = serverStatus === 'stopped';
         openChatBtn.disabled = serverStatus !== 'running';

        // Update logs
        updateLogsDisplay();

    } catch (error) {
        console.error('Error updating status:', error);
    }
}

// Update logs display
function updateLogsDisplay() {
    logsContainer.innerHTML = '';

    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${log.type}`;
        logEntry.textContent = `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message.trim()}`;
        logsContainer.appendChild(logEntry);
    });

    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Also update full logs if visible
    if (currentTab === 'logs') {
        updateLogsDisplayFull();
    }
}

// Start polling for status updates
function startStatusPolling() {
    statusInterval = setInterval(updateStatus, 2000);
}

// Stop polling
function stopStatusPolling() {
    if (statusInterval) {
        clearInterval(statusInterval);
    }
}

// API testing
testApiBtn.addEventListener('click', async () => {
    const endpoint = apiEndpoint.value;
    const requestBody = apiRequest.value;

    try {
        testApiBtn.disabled = true;
        testApiBtn.innerHTML = '<span class="loading"></span> Testing...';

        let body;
        try {
            body = JSON.parse(requestBody);
        } catch (e) {
            await showAlert('Invalid JSON', 'Invalid JSON in request body');
            return;
        }

        // Call llama-server directly on 127.0.0.1:5005/v1
        const response = await fetch(`http://127.0.0.1:5005${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        let result;
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            result = await response.text();
        }

        apiResponse.textContent = `Status: ${response.status} ${response.statusText}\n\n${JSON.stringify(result, null, 2)}`;

    } catch (error) {
        console.error('API test error:', error);
        apiResponse.textContent = `Error: ${error.message}`;
    } finally {
        testApiBtn.disabled = false;
        testApiBtn.innerHTML = 'Test API';
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    stopStatusPolling();
});

// Load saved configuration
function loadSavedConfig() {
    const saved = localStorage.getItem('llama-config');
    if (saved) {
        const config = JSON.parse(saved);
        Object.keys(config).forEach(key => {
            const element = document.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = config[key];
                } else {
                    element.value = config[key];
                }
            }
        });
    }
}

// Save configuration
function saveConfig() {
    const config = getFormValues();
    localStorage.setItem('llama-config', JSON.stringify(config));
}

// Update command preview
function updateCommandPreview() {
    const config = getFormValues();
    const serverPath = 'llama-server';
    const args = [];
    
    for (const [key, value] of Object.entries(config)) {
        if (value !== '' && value !== null && value !== undefined) {
            if (typeof value === 'boolean') {
                if (value) args.push(`--${key}`);
            } else {
                args.push(`--${key}`, `"${value}"`);
            }
        }
    }
    
    const fullCommand = [serverPath, ...args].join(' ');
    const display = document.getElementById('command-display');
    display.textContent = fullCommand;
}

// Pre-populate API test examples
apiEndpoint.addEventListener('change', () => {
    const endpoint = apiEndpoint.value;
    let example;

    switch (endpoint) {
        case '/v1/chat/completions':
            example = {
                "model": "llama",
                "messages": [
                    {"role": "user", "content": "Hello, how are you?"}
                ],
                "stream": false
            };
            break;
        case '/v1/completions':
            example = {
                "model": "llama",
                "prompt": "The future of AI is",
                "max_tokens": 100
            };
            break;
        case '/v1/embeddings':
            example = {
                "model": "llama",
                "input": "Hello world"
            };
            break;
        case '/v1/models':
            example = {};
            break;
        case '/health':
            example = {};
            break;
        default:
            example = {};
    }

    apiRequest.value = JSON.stringify(example, null, 2);
});

// Auto-populate on load
apiEndpoint.dispatchEvent(new Event('change'));