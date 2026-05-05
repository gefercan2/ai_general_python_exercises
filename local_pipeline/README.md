# Unified Local AI System

A fully local AI-powered document analysis and Q&A system that runs entirely on your machine. No cloud, no API keys, no data leaving your computer.

## Features

### 📁 File Management
- Upload and manage documents (txt, md, csv, pdf, docx)
- Automatic indexing into local vector database
- Batch operations for multiple files
- Real-time status tracking

### 📖 Text Analysis (Voyant-style)
- Word frequency analysis with interactive charts
- Word clouds with customizable parameters
- Keywords in Context (KWIC) search
- Corpus statistics (vocabulary diversity, sentence length, etc.)
- N-gram analysis (bigrams, trigrams)
- Multi-language stopword support (English, French, Spanish, German, Italian)

### 🤖 AI-Powered Q&A
- Four query modes for different use cases:
  - **Mode 1**: SmolLM only (fast general questions)
  - **Mode 2**: Qwen only (code and multilingual)
  - **Mode 3**: Full pipeline (routing, critique, retry)
  - **Mode 4**: TinyLlama only (fastest)
- RAG (Retrieval-Augmented Generation) using your documents
- Correction memory with semantic matching
- Automatic answer quality critique with retry
- Complete execution tracking

## System Requirements

### Hardware
- **Minimum**: 8GB RAM, 10GB free disk space
- **Recommended**: 16GB RAM, 20GB free disk space
- **GPU**: Optional (runs on CPU, GPU accelerates if available)

### Software
- **Python**: 3.8 or higher
- **Ollama**: Latest version
- **Operating System**: Windows, macOS, or Linux

## Installation

### 1. Install Ollama

Download and install Ollama from [https://ollama.ai](https://ollama.ai)

### 2. Pull Required Models

```bash
ollama pull smollm2:1.7b
ollama pull qwen2.5:1.5b
ollama pull tinyllama:1.1b
```

### 3. Clone or Download This Project

```bash
git clone <your-repo-url>
cd unified-local-ai
```

Or download and extract the ZIP file.

### 4. Install Python Dependencies

#### Option A: Automatic (Recommended)

Just run the launcher - it will create the virtual environment and install dependencies automatically:

**Windows:**
```bash
launch.bat
```

**macOS/Linux:**
```bash
chmod +x launch.sh
./launch.sh
```

#### Option B: Manual

```bash
# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Quick Start (One-Click Launch)

**Windows:** Double-click `launch.bat`

**macOS/Linux:** 
```bash
chmod +x launch.sh
./launch.sh
```

This will:
1. Check if Ollama is running (start it if needed)
2. Create/activate virtual environment
3. Install dependencies if needed
4. Launch the Streamlit application
5. Open your browser automatically

### Manual Start

If you prefer to run components separately:

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Activate venv and run app
source venv/bin/activate  # or venv\Scripts\activate on Windows
streamlit run app.py
```

### Using the Application

1. **Upload Documents** (File Manager tab)
   - Click "Choose files to upload"
   - Select your documents
   - Click "Upload & Index Files"
   - Files are automatically indexed for RAG

2. **Analyze Text** (Text Analysis tab)
   - Select a file from the dropdown
   - View statistics, word frequencies, word cloud
   - Search for keywords in context (KWIC)
   - Explore bigrams and word length distribution

3. **Ask Questions** (AI Query tab)
   - Configure query mode in sidebar
   - Enable/disable RAG and correction memory
   - Type your question
   - Click "Ask"
   - View answer with sources and metadata
   - Correct wrong answers to improve future responses

## Configuration

### Changing Models

Edit `core/config.py`:

```python
OLLAMA_MODELS = {
    "smollm": "smollm2:1.7b",
    "qwen": "qwen2.5:1.5b",
    "tinyllama": "tinyllama:1.1b"
}
```

### Adjusting Performance

For older hardware, reduce token limits in `core/config.py`:

```python
MAX_TOKENS = {
    "smollm": 200,      # Reduce from 300
    "qwen": 200,        # Reduce from 300
    "tinyllama": 150    # Reduce from 200
}

CHUNK_SIZE = 400        # Reduce from 500
RAG_TOP_K = 2          # Reduce from 3
```

### Changing Ports

Edit `launcher.py`:

```python
STREAMLIT_PORT = 8501  # Change to your preferred port
```

## Project Structure

```
unified-local-ai/
├── app.py                      # Main Streamlit application
├── launcher.py                 # Python launcher script
├── launch.bat                  # Windows launcher
├── launch.sh                   # macOS/Linux launcher
├── requirements.txt            # Python dependencies
├── .gitignore                  # Git ignore rules
│
├── core/                       # Foundation layer
│   ├── config.py              # Centralized configuration
│   ├── models.py              # Model management
│   ├── embeddings.py          # Embedding generation
│   └── __init__.py
│
├── services/                   # Persistent services
│   ├── vector_store.py        # ChromaDB RAG
│   ├── correction_memory.py   # Verified answers
│   └── __init__.py
│
├── modules/                    # Application modules
│   ├── file_manager.py        # File operations
│   ├── text_analysis.py       # Voyant-style analysis
│   ├── ai_pipeline.py         # Query orchestration
│   └── __init__.py
│
├── my_documents/              # Your files (gitignored)
├── my_vector_db/              # ChromaDB index (gitignored)
└── corrections.json           # Saved corrections (gitignored)
```

## Troubleshooting

### Ollama Not Found

**Error:** `Ollama is not running`

**Solution:**
```bash
# Check if Ollama is installed
ollama --version

# If not installed, download from https://ollama.ai

# Start Ollama
ollama serve
```

### Model Not Found

**Error:** `Model not found: smollm2:1.7b`

**Solution:**
```bash
ollama pull smollm2:1.7b
ollama pull qwen2.5:1.5b
ollama pull tinyllama:1.1b
```

### Virtual Environment Issues

**Error:** `Virtual environment not found`

**Solution:**
```bash
# Delete existing venv if corrupted
rm -rf venv

# Create fresh environment
python -m venv venv

# Activate and install
source venv/bin/activate  # or venv\Scripts\activate
pip install -r requirements.txt
```

### Port Already in Use

**Error:** `Port 8501 is already in use`

**Solution:**
```bash
# Find and kill the process (Linux/macOS)
lsof -ti:8501 | xargs kill -9

# Or change the port in launcher.py
STREAMLIT_PORT = 8502
```

### Out of Memory

**Error:** Models crash or system becomes unresponsive

**Solution:**
1. Close other applications
2. Use Mode 4 (TinyLlama only) - fastest, lowest memory
3. Reduce `MAX_TOKENS` and `CHUNK_SIZE` in config.py
4. Index fewer documents at a time

### Slow Performance

**Symptoms:** Queries take 30+ seconds

**Solutions:**
- Use Mode 4 for simple questions
- Disable RAG for general knowledge questions
- Reduce `RAG_TOP_K` to 2 or 1
- Check if Ollama is using CPU instead of GPU
- Close other applications to free RAM

## Advanced Usage

### Testing Individual Modules

Each module can be tested independently:

```bash
# Test configuration
python core/config.py

# Test models
python core/models.py

# Test embeddings
python core/embeddings.py

# Test vector store
python services/vector_store.py

# Test correction memory
python services/correction_memory.py

# Test file manager
python modules/file_manager.py

# Test text analysis
python modules/text_analysis.py

# Test AI pipeline
python modules/ai_pipeline.py
```

### Programmatic Usage

You can import and use modules in your own scripts:

```python
from modules import create_file_manager, create_pipeline, QueryMode

# File management
fm = create_file_manager()
fm.index_all_files()

# Query pipeline
pipeline = create_pipeline(mode=QueryMode.FULL_PIPELINE)
result = pipeline.query("What is machine learning?")
print(result.answer)
```

### Exporting Corrections

```python
from services import create_correction_memory

memory = create_correction_memory()
memory.export_corrections(Path("my_corrections.txt"))
```

### Batch Indexing

```python
from modules import create_file_manager

fm = create_file_manager()
result = fm.index_all_files()
print(f"Indexed {result['files_indexed']} files")
```

## Privacy & Data

- **All processing is local** - no data sent to external APIs
- **Your documents** are stored in `my_documents/` (gitignored)
- **Vector embeddings** are stored in `my_vector_db/` (gitignored)
- **Corrections** are saved in `corrections.json` (gitignored)
- **No telemetry** - Streamlit usage stats are disabled

To backup your data:
```bash
# Backup documents
cp -r my_documents/ backup/

# Backup vector database
cp -r my_vector_db/ backup/

# Backup corrections
cp corrections.json backup/
```

## Contributing

This is a personal project, but suggestions and improvements are welcome:

1. Test the system
2. Document any issues
3. Suggest improvements
4. Share your use cases

## License

[Your chosen license]

## Acknowledgments

- **Ollama** - Local LLM inference
- **LangChain** - LLM orchestration framework
- **ChromaDB** - Vector database
- **Sentence Transformers** - Embedding models
- **Streamlit** - Web interface
- **NLTK** - Text processing
- **Voyant Tools** - Inspiration for text analysis features

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Test individual modules
3. Check Ollama logs: `ollama logs`
4. Open an issue with detailed error messages

---

**Version:** 1.0.0  
**Last Updated:** 2024  
**Status:** Production Ready
