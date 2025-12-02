const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { install, checkLlamaServer } = require('./install');

const app = express();
const PORT = 54321;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Global state
let llamaServerProcess = null;
let serverStatus = 'stopped';
let serverLogs = [];

// Models directory
const MODELS_DIR = path.join(__dirname, '../models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// Check and install llama-server on startup
async function initializeLlamaServer() {
  try {
    console.log('Checking for llama-server...');
    let serverPath = checkLlamaServer();
    console.log('Check result:', serverPath ? `Found at: ${serverPath}` : 'Not found');
    if (!serverPath) {
      console.log('llama-server not found, installing...');
      await install();
      serverPath = checkLlamaServer();
      console.log('Post-install check:', serverPath ? `Found at: ${serverPath}` : 'Still not found');
      if (!serverPath) {
        console.log('Warning: Failed to install llama-server, will attempt on first start request');
      } else {
        console.log(`llama-server installed successfully at: ${serverPath}`);
      }
    } else {
      console.log(`llama-server found at: ${serverPath}`);
    }
    
    // Check for models
    const models = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf'));
    if (models.length === 0) {
      console.log(`\nNo models found in ${MODELS_DIR}`);
      console.log('Add .gguf model files to the models/ directory to get started');
    } else {
      console.log(`\nFound ${models.length} model(s)`);
    }
  } catch (error) {
    console.error('Error during llama-server initialization:', error.message);
  }
}

// Load flag definitions
const flagDefinitions = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/llama-flags.json'), 'utf-8'));

// Start server endpoint
app.post('/start-server', async (req, res) => {
  if (serverStatus === 'running') {
    return res.status(400).json({ error: 'Server is already running' });
  }

  try {
    // Check if llama-server is available
    const serverPath = checkLlamaServer();
    if (!serverPath) {
      return res.status(503).json({ error: 'llama-server is not installed or available. Please try again or check the server logs.' });
    }

    const flags = req.body;
    
    // Check if any models exist
    const availableModels = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf'));
    if (availableModels.length === 0) {
      return res.status(400).json({ 
        error: 'No models found. Please add a .gguf model file to the models/ directory first.',
        modelsDir: MODELS_DIR
      });
    }
    
    // Check if any preset is enabled
    const presetFlags = [
      'embd-gemma-default',
      'fim-qwen-1.5b-default',
      'fim-qwen-3b-default',
      'fim-qwen-7b-default',
      'fim-qwen-7b-spec',
      'fim-qwen-14b-spec',
      'fim-qwen-30b-default',
      'gpt-oss-20b-default',
      'gpt-oss-120b-default',
      'vision-gemma-4b-default',
      'vision-gemma-12b-default'
    ];
    
    const hasPreset = presetFlags.some(p => flags[p]);
    
    if (!flags.model && !hasPreset) {
      return res.status(400).json({ error: 'Please select a model or enable a preset' });
    }

    serverStatus = 'starting';
    
    // Build command arguments
    const args = [];
    for (const [key, value] of Object.entries(flags)) {
      if (value !== '' && value !== null && value !== undefined) {
        const flagDef = flagDefinitions[key];
        const defaultValue = flagDef?.default;
        
        // Only include if value differs from default
        if (value !== defaultValue) {
          if (typeof value === 'boolean') {
            if (value) args.push(`--${key}`);
          } else {
            args.push(`--${key}`, String(value));
          }
        }
      }
    }

    console.log(`Starting llama-server with ${args.length} arguments`);
    llamaServerProcess = spawn(serverPath, args, {
      stdio: 'pipe',
      detached: false
    });

    llamaServerProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        serverLogs.push({ type: 'stdout', message, timestamp: new Date() });
        console.log('[llama-server stdout]', message);
      }
    });

    llamaServerProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        serverLogs.push({ type: 'stderr', message, timestamp: new Date() });
        console.log('[llama-server stderr]', message);
      }
    });

    llamaServerProcess.on('close', (code) => {
      serverStatus = 'stopped';
      serverLogs.push({ 
        type: 'exit', 
        message: `Process exited with code ${code}`, 
        timestamp: new Date() 
      });
      console.log(`llama-server exited with code ${code}`);
      llamaServerProcess = null;
    });

    res.json({ success: true, message: 'Server starting...' });
  } catch (error) {
    console.error('Error starting server:', error);
    serverStatus = 'stopped';
    res.status(500).json({ error: error.message });
  }
});

// Stop server endpoint
app.post('/stop-server', (req, res) => {
  if (!llamaServerProcess) {
    return res.status(400).json({ error: 'Server is not running' });
  }

  try {
    process.kill(-llamaServerProcess.pid);
    res.json({ success: true, message: 'Server stop signal sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Server status endpoint
app.get('/server-status', (req, res) => {
  res.json({
    status: serverStatus,
    logs: serverLogs.slice(-100) // Return last 100 logs
  });
});

// Get flag definitions endpoint
app.get('/flag-definitions', (req, res) => {
  res.json(flagDefinitions);
});

// Get available models endpoint
app.get('/models', (req, res) => {
  try {
    const files = fs.readdirSync(MODELS_DIR);
    const models = files
      .filter(f => f.endsWith('.gguf'))
      .map(filename => {
        const filepath = path.join(MODELS_DIR, filename);
        const stats = fs.statSync(filepath);
        return {
          name: filename,
          path: path.join('models', filename),
          size: stats.size
        };
      });
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear logs endpoint
app.post('/clear-logs', (req, res) => {
  serverLogs = [];
  res.json({ success: true });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Initialize on startup and then start server
initializeLlamaServer().then(() => {
  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Llama.cpp WebUI server running on ${url}`);
    
    // Open browser
    (async () => {
      try {
        const open = await import('open');
        await open.default(url);
      } catch (err) {
        console.log(`Note: Could not automatically open browser. Visit ${url} manually.`);
      }
    })();
  });
}).catch((error) => {
  console.error('Failed to initialize llama-server:', error);
  process.exit(1);
});
