# YapperJS

A comprehensive web UI wrapper for llama.cpp server with full flag control, preset model support, and streamlined inference configuration.

## Overview

Yapper provides an intuitive interface for managing llama.cpp server instances. It exposes all 191 command-line flags with sensible defaults, supports 11 built-in model presets for quick setup, and intelligently filters which arguments are passed to the server based on user configuration.

## Features

- Complete llama.cpp flag control via web UI
- 11 preset model configurations for instant setup
- Smart argument filtering (only non-default flags sent to server)
- Real-time server status monitoring
- Full OpenAI-compatible API proxy to llama.cpp
- Model validation and management
- Comprehensive logging and diagnostics

## Installation

1. Clone the repository or extract the archive
2. Install dependencies:
   ```bash
   npm install
   ```

3. Install llama.cpp binary (automatic on first run, or manual):
   ```bash
   npm run install-llama
   ```

4. Add model files to the `models/` directory (required for custom models)

## Usage

The easiest way to start is to run the start script for your operating system:

**Windows:**
Double-click `start.bat`

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

This will check for Node.js, open the web UI in your default browser, and start the server.

Alternatively, start manually:

Development server:
```bash
npm run dev
```

Production server:
```bash
npm start
```

The web UI will be available at `http://127.0.0.1:54321`

## Configuration

All flags are defined in `llama-flags.json` with complete metadata:
- Type information (boolean, number, text, file, select)
- Default values
- Short flags (e.g., `-m`, `-t`)
- Section grouping
- Descriptions

### Starting the Server

1. Open the web UI
2. Either select a preset model or upload a custom model from the models directory
3. Configure flags as needed (only non-default values are sent to llama.cpp)
4. Click "Start Server"

The server runs on port 8080 by default and is accessible via `http://127.0.0.1:8080/v1` for API calls.

## Preset Models

Available presets:
- embd-gemma-default
- fim-qwen-1.5b-default
- fim-qwen-3b-default
- fim-qwen-7b-default
- fim-qwen-7b-spec
- fim-qwen-14b-spec
- fim-qwen-30b-default
- gpt-oss-20b-default
- gpt-oss-120b-default
- vision-gemma-4b-default
- vision-gemma-12b-default

When a preset is enabled, no custom model selection is required.

## API

The server proxies all llama.cpp endpoints. Common endpoints include:

- `POST /v1/chat/completions` - Chat completion
- `POST /v1/completions` - Text completion
- `GET /health` - Server health check

Refer to the llama.cpp documentation for full API details.

## Project Structure

```
yapper/
  public/           - Web UI frontend
  models/           - GGUF model files
  llama.cpp/        - llama.cpp source (if built locally)
  llama-flags.json  - Flag definitions with defaults
  server.js         - Express backend
  install.js        - Installation script
  package.json      - Dependencies
```

## Troubleshooting

### No models found
Ensure `.gguf` files are in the `models/` directory. The server will list available models in the web UI.

### Server won't start
Check the logs tab in the web UI for detailed error messages. Common issues:
- llama-server binary not installed (run `npm run install-llama`)
- Invalid model path
- Port already in use

### Installation fails
If automatic llama.cpp installation fails, install manually from the official repository: https://github.com/ggml-org/llama.cpp

## License

MIT

## Author

Tomobobo710
