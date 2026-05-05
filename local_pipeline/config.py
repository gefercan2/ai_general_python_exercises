"""
Centralized configuration for the Unified Local AI System.

All paths, model names, chunk sizes, and thresholds are defined here.
Modify these values to customize the system behavior.
"""

from pathlib import Path

# ============================================================================
# DIRECTORY PATHS
# ============================================================================

# Base directory (project root)
BASE_DIR = Path(__file__).parent.parent

# User document repository
DOCUMENTS_DIR = BASE_DIR / "my_documents"

# ChromaDB vector database storage
VECTOR_DB_DIR = BASE_DIR / "my_vector_db"

# Correction memory file
CORRECTIONS_FILE = BASE_DIR / "corrections.json"

# Ensure directories exist
DOCUMENTS_DIR.mkdir(exist_ok=True)
VECTOR_DB_DIR.mkdir(exist_ok=True)


# ============================================================================
# MODEL CONFIGURATION
# ============================================================================

# Ollama models (ensure these are pulled: ollama pull <model>)
OLLAMA_MODELS = {
    "smollm": "smollm2:1.7b",      # General questions, fast
    "qwen": "qwen2.5:1.8b",        # Code, multilingual
    "tinyllama": "tinyllama:1.1b"  # Fastest, simple queries
}

# HuggingFace model for router/critic (loaded directly, not via Ollama)
HUGGINGFACE_MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"

# Embedding model for semantic similarity
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Default model for each mode
MODE_MODELS = {
    1: "smollm",      # Mode 1: SmolLM only
    2: "qwen",        # Mode 2: Qwen only
    3: "smollm",      # Mode 3: Full pipeline (starts with SmolLM)
    4: "tinyllama"    # Mode 4: TinyLlama only (fastest)
}

# Fallback model when primary fails
FALLBACK_MAP = {
    "smollm": "qwen",
    "qwen": "smollm",
    "tinyllama": "smollm"
}


# ============================================================================
# RAG CONFIGURATION
# ============================================================================

# Text chunking parameters
CHUNK_SIZE = 500          # Tokens per chunk
CHUNK_OVERLAP = 50        # Token overlap between chunks

# Retrieval parameters
RAG_TOP_K = 3            # Number of document chunks to retrieve
RAG_SIMILARITY_THRESHOLD = 0.3  # Minimum similarity score for retrieval


# ============================================================================
# CORRECTION MEMORY CONFIGURATION
# ============================================================================

# Semantic similarity threshold for correction memory hits
MEMORY_SIMILARITY_THRESHOLD = 0.85

# Maximum number of corrections to store (for performance)
MAX_CORRECTIONS = 1000


# ============================================================================
# LLM GENERATION PARAMETERS
# ============================================================================

# Token generation limits (keep low for old hardware)
MAX_TOKENS = {
    "smollm": 300,
    "qwen": 300,
    "tinyllama": 200
}

# Temperature (lower = more deterministic)
TEMPERATURE = 0.2

# Context window size
CONTEXT_WINDOW = 2048


# ============================================================================
# TEXT ANALYSIS CONFIGURATION
# ============================================================================

# Stopword languages supported
STOPWORD_LANGUAGES = ["english", "french", "spanish", "german", "italian"]

# Default stopword language
DEFAULT_STOPWORD_LANG = "english"

# Word frequency top N
WORD_FREQ_TOP_N = 30

# Word cloud parameters
WORDCLOUD_WIDTH = 800
WORDCLOUD_HEIGHT = 400
WORDCLOUD_BACKGROUND = "white"

# KWIC (Keywords in Context) parameters
KWIC_MAX_RESULTS = 20  # Maximum context snippets to show


# ============================================================================
# PIPELINE CONFIGURATION
# ============================================================================

# Maximum retry attempts when answer fails critique
MAX_RETRIES = 2

# Critique pass/fail keywords
CRITIQUE_PASS_KEYWORDS = ["yes", "answers", "clear", "relevant"]
CRITIQUE_FAIL_KEYWORDS = ["no", "does not", "unclear", "irrelevant", "off-topic"]


# ============================================================================
# STREAMLIT UI CONFIGURATION
# ============================================================================

# Page configuration
PAGE_TITLE = "Unified Local AI System"
PAGE_ICON = "🤖"
LAYOUT = "wide"

# File upload settings
ALLOWED_EXTENSIONS = ["txt", "md", "csv", "pdf", "docx"]
MAX_FILE_SIZE_MB = 50


# ============================================================================
# SYSTEM MESSAGES
# ============================================================================

STARTUP_MESSAGE = """
🚀 Unified Local AI System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Models loaded: SmolLM 1.7B, Qwen 1.8B, TinyLlama 1.1B
✓ Vector store ready
✓ Correction memory active
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

OLLAMA_NOT_RUNNING = """
⚠️  Ollama is not running.
Please start Ollama in a separate terminal:
    ollama serve
"""

MODEL_NOT_FOUND = """
⚠️  Model not found: {model}
Please pull the model first:
    ollama pull {model}
"""


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_model_name(mode: int) -> str:
    """Get the Ollama model name for a given mode."""
    model_key = MODE_MODELS.get(mode, "smollm")
    return OLLAMA_MODELS[model_key]


def get_fallback_model(current_model: str) -> str:
    """Get the fallback model for a given model."""
    return OLLAMA_MODELS[FALLBACK_MAP.get(current_model, "smollm")]


def get_max_tokens(model_key: str) -> int:
    """Get max tokens for a model."""
    return MAX_TOKENS.get(model_key, 300)


# ============================================================================
# VALIDATION
# ============================================================================

def validate_setup():
    """
    Validate that all required directories exist and models are configured.
    Returns tuple: (is_valid, error_messages)
    """
    errors = []
    
    # Check directories
    if not DOCUMENTS_DIR.exists():
        errors.append(f"Documents directory not found: {DOCUMENTS_DIR}")
    
    if not VECTOR_DB_DIR.exists():
        errors.append(f"Vector DB directory not found: {VECTOR_DB_DIR}")
    
    # Check if models are reasonable (actual availability checked at runtime)
    if not OLLAMA_MODELS:
        errors.append("No Ollama models configured")
    
    if not EMBEDDING_MODEL:
        errors.append("No embedding model configured")
    
    return len(errors) == 0, errors


if __name__ == "__main__":
    # Test configuration
    print("Configuration loaded successfully!")
    print(f"\nBase directory: {BASE_DIR}")
    print(f"Documents: {DOCUMENTS_DIR}")
    print(f"Vector DB: {VECTOR_DB_DIR}")
    print(f"Corrections: {CORRECTIONS_FILE}")
    print(f"\nOllama models: {OLLAMA_MODELS}")
    print(f"Embedding model: {EMBEDDING_MODEL}")
    
    is_valid, errors = validate_setup()
    if is_valid:
        print("\n✓ Configuration is valid")
    else:
        print("\n⚠️  Configuration errors:")
        for error in errors:
            print(f"  - {error}")
