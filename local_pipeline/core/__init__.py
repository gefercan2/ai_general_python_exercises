"""
Core module for the Unified Local AI System.

Provides centralized configuration, model management, and embedding services.
"""

from .config import *
from .models import ModelManager, TinyLlamaLocal, check_ollama_running
from .embeddings import (
    EmbeddingManager,
    get_embedding_manager,
    embed_text,
    embed_texts,
    cosine_similarity,
    find_most_similar
)

__all__ = [
    # Config
    'BASE_DIR',
    'DOCUMENTS_DIR',
    'VECTOR_DB_DIR',
    'CORRECTIONS_FILE',
    'OLLAMA_MODELS',
    'MODE_MODELS',
    'CHUNK_SIZE',
    'CHUNK_OVERLAP',
    'RAG_TOP_K',
    'MEMORY_SIMILARITY_THRESHOLD',
    
    # Models
    'ModelManager',
    'TinyLlamaLocal',
    'check_ollama_running',
    
    # Embeddings
    'EmbeddingManager',
    'get_embedding_manager',
    'embed_text',
    'embed_texts',
    'cosine_similarity',
    'find_most_similar',
]
