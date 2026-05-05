"""
Application modules for the Unified Local AI System.

Provides the three main features:
- File management and indexing
- Text analysis (Voyant-style)
- AI query pipeline
"""

from .file_manager import (
    FileManager,
    create_file_manager,
    get_file_summary
)

from .text_analysis import (
    TextAnalyzer,
    analyze_text,
    quick_stats,
    get_top_words,
    search_context
)

from .ai_pipeline import (
    AIPipeline,
    PipelineResult,
    QueryMode,
    create_pipeline,
    quick_query
)

__all__ = [
    # File manager
    'FileManager',
    'create_file_manager',
    'get_file_summary',
    
    # Text analysis
    'TextAnalyzer',
    'analyze_text',
    'quick_stats',
    'get_top_words',
    'search_context',
    
    # AI pipeline
    'AIPipeline',
    'PipelineResult',
    'QueryMode',
    'create_pipeline',
    'quick_query',
]
