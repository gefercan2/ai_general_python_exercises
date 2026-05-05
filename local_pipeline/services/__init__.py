"""
Services module for the Unified Local AI System.

Provides persistent storage services for RAG and correction memory.
"""

from .vector_store import (
    VectorStore,
    DocumentIndexer,
    create_vector_store,
    create_indexer
)

from .correction_memory import (
    CorrectionMemory,
    create_correction_memory,
    check_for_correction
)

__all__ = [
    # Vector store
    'VectorStore',
    'DocumentIndexer',
    'create_vector_store',
    'create_indexer',
    
    # Correction memory
    'CorrectionMemory',
    'create_correction_memory',
    'check_for_correction',
]
