"""
File manager module for the Unified Local AI System.

Handles file upload, parsing, and indexing into the vector store.
Provides functions for managing the document repository and RAG index.
"""

from typing import List, Dict, Any, Optional
from pathlib import Path
import shutil

from core.config import (
    DOCUMENTS_DIR,
    ALLOWED_EXTENSIONS
)
from services import create_vector_store, create_indexer


class FileManager:
    """
    Manages document files and their indexing into the vector store.
    Handles upload, deletion, reindexing, and status tracking.
    """
    
    def __init__(self):
        """Initialize the file manager with vector store and indexer."""
        self.documents_dir = DOCUMENTS_DIR
        self.documents_dir.mkdir(exist_ok=True)
        
        self.vector_store = create_vector_store()
        self.indexer = create_indexer(self.vector_store)
    
    def get_all_files(self) -> List[Dict[str, Any]]:
        """
        Get list of all files in the document repository.
        
        Returns:
            List of file info dictionaries with name, size, extension, path
        """
        files = []
        
        for ext in ALLOWED_EXTENSIONS:
            for file_path in self.documents_dir.glob(f"*.{ext}"):
                if file_path.is_file():
                    files.append({
                        'name': file_path.name,
                        'extension': file_path.suffix.lower(),
                        'size_bytes': file_path.stat().st_size,
                        'size_kb': round(file_path.stat().st_size / 1024, 2),
                        'path': file_path
                    })
        
        # Sort by name
        files.sort(key=lambda x: x['name'].lower())
        
        return files
    
    def get_indexed_sources(self) -> List[str]:
        """
        Get list of all sources currently indexed in the vector store.
        
        Returns:
            List of source filenames
        """
        return self.vector_store.get_sources()
    
    def get_file_status(self) -> Dict[str, Any]:
        """
        Get comprehensive status of files and indexing.
        
        Returns:
            Dictionary with counts and lists
        """
        all_files = self.get_all_files()
        indexed_sources = set(self.get_indexed_sources())
        
        # Determine which files are indexed
        indexed_files = []
        unindexed_files = []
        
        for file_info in all_files:
            if file_info['name'] in indexed_sources:
                indexed_files.append(file_info)
            else:
                unindexed_files.append(file_info)
        
        return {
            'total_files': len(all_files),
            'indexed_count': len(indexed_files),
            'unindexed_count': len(unindexed_files),
            'total_chunks': self.vector_store.count(),
            'indexed_files': indexed_files,
            'unindexed_files': unindexed_files,
            'all_files': all_files
        }
    
    def upload_file(self, uploaded_file, save_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Save an uploaded file to the document repository.
        
        Args:
            uploaded_file: File-like object (e.g., from Streamlit uploader)
            save_name: Optional custom filename (uses original if not provided)
        
        Returns:
            Dictionary with success status and file info
        """
        try:
            # Determine filename
            filename = save_name if save_name else uploaded_file.name
            file_path = self.documents_dir / filename
            
            # Check if file already exists
            if file_path.exists():
                return {
                    'success': False,
                    'message': f"File '{filename}' already exists. Delete it first or choose a different name.",
                    'file_path': None
                }
            
            # Check extension
            extension = Path(filename).suffix.lower().lstrip('.')
            if extension not in ALLOWED_EXTENSIONS:
                return {
                    'success': False,
                    'message': f"File type '.{extension}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
                    'file_path': None
                }
            
            # Save file
            with open(file_path, 'wb') as f:
                f.write(uploaded_file.getbuffer())
            
            file_size = file_path.stat().st_size
            
            return {
                'success': True,
                'message': f"Successfully uploaded '{filename}' ({file_size / 1024:.2f} KB)",
                'file_path': file_path,
                'filename': filename,
                'size_bytes': file_size
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f"Error uploading file: {e}",
                'file_path': None
            }
    
    def delete_file(self, filename: str, remove_from_index: bool = True) -> Dict[str, Any]:
        """
        Delete a file from the repository and optionally from the index.
        
        Args:
            filename: Name of the file to delete
            remove_from_index: Whether to also remove from vector store
        
        Returns:
            Dictionary with success status and details
        """
        file_path = self.documents_dir / filename
        
        if not file_path.exists():
            return {
                'success': False,
                'message': f"File '{filename}' not found"
            }
        
        try:
            # Remove from index first (if requested)
            chunks_deleted = 0
            if remove_from_index:
                chunks_deleted = self.vector_store.delete_by_source(filename)
            
            # Delete file
            file_path.unlink()
            
            return {
                'success': True,
                'message': f"Deleted '{filename}' ({chunks_deleted} chunks removed from index)",
                'chunks_deleted': chunks_deleted
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f"Error deleting file: {e}"
            }
    
    def index_file(self, filename: str) -> Dict[str, Any]:
        """
        Index a single file into the vector store.
        
        Args:
            filename: Name of the file to index
        
        Returns:
            Dictionary with success status and chunk count
        """
        file_path = self.documents_dir / filename
        
        if not file_path.exists():
            return {
                'success': False,
                'message': f"File '{filename}' not found",
                'chunks_indexed': 0
            }
        
        try:
            chunks = self.indexer.index_file(file_path)
            
            return {
                'success': True,
                'message': f"Indexed '{filename}' ({chunks} chunks)",
                'chunks_indexed': chunks
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f"Error indexing file: {e}",
                'chunks_indexed': 0
            }
    
    def reindex_file(self, filename: str) -> Dict[str, Any]:
        """
        Remove old chunks and reindex a file.
        
        Args:
            filename: Name of the file to reindex
        
        Returns:
            Dictionary with success status and details
        """
        file_path = self.documents_dir / filename
        
        if not file_path.exists():
            return {
                'success': False,
                'message': f"File '{filename}' not found",
                'chunks_indexed': 0
            }
        
        try:
            chunks = self.indexer.reindex_file(file_path)
            
            return {
                'success': True,
                'message': f"Reindexed '{filename}' ({chunks} chunks)",
                'chunks_indexed': chunks
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f"Error reindexing file: {e}",
                'chunks_indexed': 0
            }
    
    def index_all_files(self) -> Dict[str, Any]:
        """
        Index all unindexed files in the repository.
        
        Returns:
            Dictionary with results for each file
        """
        status = self.get_file_status()
        unindexed = status['unindexed_files']
        
        if not unindexed:
            return {
                'success': True,
                'message': 'All files already indexed',
                'files_indexed': 0,
                'total_chunks': 0,
                'results': {}
            }
        
        results = {}
        total_chunks = 0
        
        print(f"\nIndexing {len(unindexed)} files...\n")
        
        for file_info in unindexed:
            result = self.index_file(file_info['name'])
            results[file_info['name']] = result
            if result['success']:
                total_chunks += result['chunks_indexed']
        
        successful = sum(1 for r in results.values() if r['success'])
        
        return {
            'success': True,
            'message': f"Indexed {successful}/{len(unindexed)} files ({total_chunks} chunks)",
            'files_indexed': successful,
            'total_chunks': total_chunks,
            'results': results
        }
    
    def clear_index(self) -> Dict[str, Any]:
        """
        Clear all documents from the vector store.
        Files remain in the repository.
        
        Returns:
            Dictionary with success status
        """
        try:
            old_count = self.vector_store.count()
            self.vector_store.clear()
            
            return {
                'success': True,
                'message': f"Cleared index ({old_count} chunks removed)",
                'chunks_removed': old_count
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f"Error clearing index: {e}",
                'chunks_removed': 0
            }
    
    def search_files(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Search indexed documents for relevant chunks.
        
        Args:
            query: Search query
            top_k: Number of results to return
        
        Returns:
            List of matching chunks with metadata
        """
        results = self.vector_store.query(query, top_k=top_k)
        return results


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def create_file_manager() -> FileManager:
    """Create a FileManager instance."""
    return FileManager()


def get_file_summary() -> str:
    """
    Get a text summary of file and indexing status.
    
    Returns:
        Formatted string with status information
    """
    manager = create_file_manager()
    status = manager.get_file_status()
    
    summary = f"""
📁 FILE REPOSITORY STATUS
{'='*60}
Total files: {status['total_files']}
Indexed: {status['indexed_count']}
Unindexed: {status['unindexed_count']}
Total chunks in index: {status['total_chunks']}
{'='*60}
"""
    
    if status['indexed_files']:
        summary += "\nIndexed files:\n"
        for file_info in status['indexed_files']:
            summary += f"  ✓ {file_info['name']} ({file_info['size_kb']} KB)\n"
    
    if status['unindexed_files']:
        summary += "\nUnindexed files:\n"
        for file_info in status['unindexed_files']:
            summary += f"  ○ {file_info['name']} ({file_info['size_kb']} KB)\n"
    
    return summary


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing file manager...\n")
    
    # Create file manager
    print("1. Initializing file manager...")
    manager = create_file_manager()
    print(f"   Documents directory: {manager.documents_dir}")
    
    # Get status
    print("\n2. Getting file status...")
    status = manager.get_file_status()
    print(f"   Total files: {status['total_files']}")
    print(f"   Indexed: {status['indexed_count']}")
    print(f"   Unindexed: {status['unindexed_count']}")
    print(f"   Total chunks: {status['total_chunks']}")
    
    # Create a test file
    print("\n3. Creating test file...")
    test_file = manager.documents_dir / "test_file.txt"
    test_content = """
This is a test document for the file manager.
It contains information about GPUs and machine learning.
The GTX 850M has 2GB of GDDR5 memory.
Training models on older hardware requires optimization.
"""
    test_file.write_text(test_content.strip())
    print(f"   ✓ Created {test_file.name}")
    
    # Index the test file
    print("\n4. Indexing test file...")
    result = manager.index_file(test_file.name)
    print(f"   {result['message']}")
    
    # Search test
    print("\n5. Testing search...")
    results = manager.search_files("GPU memory", top_k=2)
    print(f"   Found {len(results)} results:")
    for i, result in enumerate(results, 1):
        print(f"   [{i}] Similarity: {result['similarity']:.3f}")
        print(f"       {result['text'][:60]}...")
    
    # Get summary
    print("\n6. Getting summary...")
    summary = get_file_summary()
    print(summary)
    
    # Cleanup
    print("\n7. Cleaning up...")
    manager.delete_file(test_file.name)
    print(f"   ✓ Deleted test file")
    
    print("\n✓ All file manager tests completed!")
