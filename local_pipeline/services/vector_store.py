"""
Vector store service for the Unified Local AI System.

Manages document storage and retrieval using ChromaDB for RAG.
Handles document chunking, embedding, indexing, and semantic search.
"""

from typing import List, Dict, Any, Optional
from pathlib import Path
import chromadb
from chromadb.config import Settings
from langchain_text_splitters import RecursiveCharacterTextSplitter
#except ImportError:
#from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    TextLoader,
    CSVLoader,
    UnstructuredMarkdownLoader
)

from core.config import (
    VECTOR_DB_DIR,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    RAG_TOP_K,
    RAG_SIMILARITY_THRESHOLD,
    ALLOWED_EXTENSIONS
)
from core.embeddings import get_embedding_manager


class VectorStore:
    """
    Manages the ChromaDB vector store for document retrieval.
    Handles indexing, querying, and metadata management.
    """
    
    def __init__(self, collection_name: str = "documents"):
        """
        Initialize the vector store.
        
        Args:
            collection_name: Name of the ChromaDB collection
        """
        self.collection_name = collection_name
        self.db_path = str(VECTOR_DB_DIR)
        self.client = None
        self.collection = None
        self.embedding_manager = get_embedding_manager()
        self._initialized = False
    
    def initialize(self):
        """Initialize ChromaDB client and collection (lazy loading)."""
        if self._initialized:
            return
        
        print(f"Initializing vector store at {self.db_path}...")
        
        try:
            # Create ChromaDB client with persistent storage
            self.client = chromadb.PersistentClient(
                path=self.db_path,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
            
            # Get or create collection
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "Document chunks for RAG retrieval"}
            )
            
            self._initialized = True
            print(f"✓ Vector store initialized ({self.collection.count()} documents)")
        
        except Exception as e:
            print(f"⚠️  Failed to initialize vector store: {e}")
            raise
    
    def add_documents(
        self,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None
    ) -> int:
        """
        Add documents to the vector store.
        
        Args:
            texts: List of text chunks to add
            metadatas: Optional metadata for each chunk
            ids: Optional custom IDs (auto-generated if not provided)
        
        Returns:
            Number of documents added
        """
        if not self._initialized:
            self.initialize()
        
        if not texts:
            return 0
        
        try:
            # Generate embeddings
            print(f"Generating embeddings for {len(texts)} chunks...")
            embeddings = self.embedding_manager.embed_texts(texts, show_progress=True)
            
            # Generate IDs if not provided
            if ids is None:
                existing_count = self.collection.count()
                ids = [f"doc_{existing_count + i}" for i in range(len(texts))]
            
            # Ensure metadatas exist
            if metadatas is None:
                metadatas = [{"source": "unknown"} for _ in texts]
            
            # Add to collection
            self.collection.add(
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas,
                ids=ids
            )
            
            print(f"✓ Added {len(texts)} documents to vector store")
            return len(texts)
        
        except Exception as e:
            print(f"⚠️  Error adding documents: {e}")
            return 0
    
    def query(
        self,
        query_text: str,
        top_k: int = RAG_TOP_K,
        min_similarity: float = RAG_SIMILARITY_THRESHOLD,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query the vector store for relevant documents.
        
        Args:
            query_text: The search query
            top_k: Number of results to return
            min_similarity: Minimum similarity threshold (0-1)
            filter_metadata: Optional metadata filter
        
        Returns:
            List of result dictionaries with 'text', 'metadata', 'similarity'
        """
        if not self._initialized:
            self.initialize()
        
        if self.collection.count() == 0:
            print("⚠️  Vector store is empty")
            return []
        
        try:
            # Generate query embedding
            query_embedding = self.embedding_manager.embed_text(query_text)
            
            # Query collection
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=filter_metadata
            )
            
            # Format results
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    # ChromaDB returns distance, convert to similarity
                    # Distance in [0, 2], similarity in [0, 1]
                    distance = results['distances'][0][i]
                    similarity = 1 - (distance / 2)
                    
                    if similarity >= min_similarity:
                        formatted_results.append({
                            'text': doc,
                            'metadata': results['metadatas'][0][i],
                            'similarity': similarity,
                            'id': results['ids'][0][i]
                        })
            
            return formatted_results
        
        except Exception as e:
            print(f"⚠️  Error querying vector store: {e}")
            return []
    
    def delete_by_source(self, source: str) -> int:
        """
        Delete all documents from a specific source.
        
        Args:
            source: The source identifier (e.g., filename)
        
        Returns:
            Number of documents deleted
        """
        if not self._initialized:
            self.initialize()
        
        try:
            # Get all IDs for this source
            results = self.collection.get(
                where={"source": source}
            )
            
            if results['ids']:
                self.collection.delete(ids=results['ids'])
                count = len(results['ids'])
                print(f"✓ Deleted {count} chunks from source: {source}")
                return count
            
            return 0
        
        except Exception as e:
            print(f"⚠️  Error deleting documents: {e}")
            return 0
    
    def get_sources(self) -> List[str]:
        """
        Get list of all unique sources in the vector store.
        
        Returns:
            List of source identifiers
        """
        if not self._initialized:
            self.initialize()
        
        try:
            # Get all documents in batches to avoid SQL variable limit
            sources = set()
            
            # Get a sample of documents to extract sources
            # Instead of getting all at once, get in smaller batches
            batch_size = 100
            offset = 0
            
            while True:
                try:
                    results = self.collection.get(limit=batch_size, offset=offset)
                    
                    if not results['ids']:
                        break
                    
                    if results['metadatas']:
                        for meta in results['metadatas']:
                            source = meta.get('source', 'unknown')
                            sources.add(source)
                    
                    offset += batch_size
                
                except Exception:
                    # If batching doesn't work, try a simpler approach
                    break
            
            # If we got sources, return them
            if sources:
                return sorted(list(sources))
            
            # Fallback: return empty list if query fails
            return []
        
        except Exception as e:
            print(f"⚠️  Error getting sources: {e}")
            return []

    def count(self) -> int:
        """Get total number of document chunks in the store."""
        if not self._initialized:
            self.initialize()
        
        try:
            return self.collection.count()
        except Exception as e:
            # Collection might have been deleted, reinitialize
            print(f"Warning: Collection error, reinitializing: {e}")
            self._initialized = False
            self.initialize()
            return self.collection.count()

    def clear(self):
        """Clear all documents from the vector store."""
        if not self._initialized:
            self.initialize()
        
        try:
            # Delete collection
            try:
                self.client.delete_collection(name=self.collection_name)
            except Exception:
                pass  # Collection might not exist
            
            # Recreate collection
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"description": "Document chunks for RAG retrieval"}
            )
            print("✓ Vector store cleared and recreated")
        
        except Exception as e:
            print(f"⚠️  Error clearing vector store: {e}")
        
        finally:
            # Always force reinitialization
            self._initialized = False
            self.initialize()


class DocumentIndexer:
    """
    Handles loading, chunking, and indexing of documents from files.
    Works with the VectorStore to populate the index.
    """
    
    def __init__(self, vector_store: VectorStore):
        """
        Initialize the document indexer.
        
        Args:
            vector_store: VectorStore instance to index into
        """
        self.vector_store = vector_store
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
    
    def load_document(self, file_path: Path) -> Optional[List[str]]:
        """
        Load a document from a file.
        
        Args:
            file_path: Path to the document file
        
        Returns:
            List of text content, or None if loading failed
        """
        suffix = file_path.suffix.lower()
        
        try:
            if suffix == '.txt':
                loader = TextLoader(str(file_path), encoding='utf-8')
            elif suffix == '.md':
                loader = UnstructuredMarkdownLoader(str(file_path))
            elif suffix == '.csv':
                loader = CSVLoader(str(file_path))
            else:
                print(f"⚠️  Unsupported file type: {suffix}")
                return None
            
            documents = loader.load()
            return [doc.page_content for doc in documents]
        
        except Exception as e:
            print(f"⚠️  Error loading {file_path.name}: {e}")
            return None
    
    def chunk_text(self, texts: List[str]) -> List[str]:
        """
        Split texts into chunks.
        
        Args:
            texts: List of text strings
        
        Returns:
            List of text chunks
        """
        all_chunks = []
        for text in texts:
            chunks = self.text_splitter.split_text(text)
            all_chunks.extend(chunks)
        return all_chunks
    
    def index_file(self, file_path: Path) -> int:
        """
        Index a single file into the vector store.
        
        Args:
            file_path: Path to the file to index
        
        Returns:
            Number of chunks indexed
        """
        print(f"\nIndexing: {file_path.name}")
        
        # Load document
        texts = self.load_document(file_path)
        if not texts:
            return 0
        
        # Chunk text
        chunks = self.chunk_text(texts)
        if not chunks:
            print(f"⚠️  No chunks generated from {file_path.name}")
            return 0
        
        print(f"  Generated {len(chunks)} chunks")
        
        # Create metadata
        metadatas = [
            {
                "source": file_path.name,
                "file_type": file_path.suffix.lower(),
                "chunk_index": i
            }
            for i in range(len(chunks))
        ]
        
        # Add to vector store
        count = self.vector_store.add_documents(chunks, metadatas)
        
        return count
    
    def index_directory(self, directory: Path, recursive: bool = False) -> Dict[str, int]:
        """
        Index all supported files in a directory.
        
        Args:
            directory: Path to the directory
            recursive: Whether to search subdirectories
        
        Returns:
            Dictionary mapping filenames to chunk counts
        """
        results = {}
        
        # Find all supported files
        pattern = "**/*" if recursive else "*"
        for ext in ALLOWED_EXTENSIONS:
            for file_path in directory.glob(f"{pattern}.{ext}"):
                if file_path.is_file():
                    count = self.index_file(file_path)
                    results[file_path.name] = count
        
        # Summary
        total_files = len(results)
        total_chunks = sum(results.values())
        print(f"\n{'='*60}")
        print(f"Indexing complete: {total_files} files, {total_chunks} chunks")
        print(f"{'='*60}")
        
        return results
    
    def reindex_file(self, file_path: Path) -> int:
        """
        Remove old chunks and reindex a file.
        
        Args:
            file_path: Path to the file to reindex
        
        Returns:
            Number of chunks indexed
        """
        # Delete old chunks
        self.vector_store.delete_by_source(file_path.name)
        
        # Index again
        return self.index_file(file_path)


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def create_vector_store() -> VectorStore:
    """Create and initialize a vector store instance."""
    store = VectorStore()
    store.initialize()
    return store


def create_indexer(vector_store: Optional[VectorStore] = None) -> DocumentIndexer:
    """Create a document indexer instance."""
    if vector_store is None:
        vector_store = create_vector_store()
    return DocumentIndexer(vector_store)


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing vector store...\n")
    
    # Test initialization
    print("1. Initializing vector store...")
    store = create_vector_store()
    print(f"   Current document count: {store.count()}")
    print(f"   Sources: {store.get_sources()}")
    
    # Test adding documents
    print("\n2. Testing document addition...")
    test_texts = [
        "The GTX 850M has 2GB GDDR5 memory and 640 CUDA cores.",
        "Training TinyLlama took 2.5 hours on a GTX 850M GPU.",
        "Python is a high-level programming language."
    ]
    test_metadatas = [
        {"source": "test_hardware.txt", "chunk_index": 0},
        {"source": "test_training.txt", "chunk_index": 0},
        {"source": "test_python.txt", "chunk_index": 0}
    ]
    
    count = store.add_documents(test_texts, test_metadatas)
    print(f"   Added {count} test documents")
    print(f"   Total count: {store.count()}")
    
    # Test querying
    print("\n3. Testing queries...")
    queries = [
        "How much memory does the GPU have?",
        "How long did training take?",
        "What is Python?"
    ]
    
    for query in queries:
        print(f"\n   Query: '{query}'")
        results = store.query(query, top_k=2)
        for i, result in enumerate(results):
            print(f"   [{i+1}] Similarity: {result['similarity']:.3f}")
            print(f"       Text: {result['text'][:60]}...")
            print(f"       Source: {result['metadata']['source']}")
    
    # Test document indexer
    print("\n4. Testing document indexer...")
    indexer = create_indexer(store)
    
    # Create a temporary test file
    from core.config import DOCUMENTS_DIR
    DOCUMENTS_DIR.mkdir(exist_ok=True)
    test_file = DOCUMENTS_DIR / "test_doc.txt"
    test_file.write_text("This is a test document for the vector store system.")
    
    if test_file.exists():
        count = indexer.index_file(test_file)
        print(f"   Indexed test file: {count} chunks")
        test_file.unlink()  # Clean up
    
    print("\n✓ All vector store tests completed!")
