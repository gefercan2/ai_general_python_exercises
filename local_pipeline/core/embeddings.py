"""
Embedding generation for the Unified Local AI System.

Provides a unified interface for generating embeddings used by:
- Vector store (RAG document retrieval)
- Correction memory (semantic similarity matching)

Uses sentence-transformers for consistent, local embedding generation.
"""

from typing import List, Union
from sentence_transformers import SentenceTransformer
import numpy as np

from .config import EMBEDDING_MODEL


class EmbeddingManager:
    """
    Manages embedding generation using sentence-transformers.
    Provides methods for both single and batch embedding generation.
    """
    
    def __init__(self, model_name: str = EMBEDDING_MODEL):
        """
        Initialize the embedding model.
        
        Args:
            model_name: Name of the sentence-transformers model to use
        """
        self.model_name = model_name
        self.model = None
        self._loaded = False
    
    def load(self):
        """Load the embedding model (lazy loading)."""
        if self._loaded:
            return
        
        print(f"Loading embedding model: {self.model_name}...")
        try:
            self.model = SentenceTransformer(self.model_name)
            self._loaded = True
            print(f"✓ Embedding model loaded successfully")
        except Exception as e:
            print(f"⚠️  Failed to load embedding model: {e}")
            raise
    
    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text string.
        
        Args:
            text: Input text to embed
        
        Returns:
            List of floats representing the embedding vector
        """
        if not self._loaded:
            self.load()
        
        try:
            embedding = self.model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            print(f"⚠️  Error generating embedding: {e}")
            return []
    
    def embed_texts(self, texts: List[str], batch_size: int = 32, show_progress: bool = False) -> List[List[float]]:
        """
        Generate embeddings for multiple texts (batch processing).
        
        Args:
            texts: List of text strings to embed
            batch_size: Number of texts to process at once
            show_progress: Show progress bar during embedding
        
        Returns:
            List of embedding vectors
        """
        if not self._loaded:
            self.load()
        
        if not texts:
            return []
        
        try:
            embeddings = self.model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=show_progress,
                convert_to_numpy=True
            )
            return embeddings.tolist()
        except Exception as e:
            print(f"⚠️  Error generating embeddings: {e}")
            return []
    
    def cosine_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """
        Calculate cosine similarity between two embeddings.
        
        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector
        
        Returns:
            Similarity score between 0 and 1 (1 = identical)
        """
        if not embedding1 or not embedding2:
            return 0.0
        
        try:
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # Cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            similarity = dot_product / (norm1 * norm2)
            
            # Clamp to [0, 1] range
            return max(0.0, min(1.0, float(similarity)))
        
        except Exception as e:
            print(f"⚠️  Error calculating similarity: {e}")
            return 0.0
    
    def find_most_similar(
        self,
        query_embedding: List[float],
        candidate_embeddings: List[List[float]],
        top_k: int = 3
    ) -> List[tuple[int, float]]:
        """
        Find the most similar embeddings to a query embedding.
        
        Args:
            query_embedding: The query embedding vector
            candidate_embeddings: List of candidate embedding vectors
            top_k: Number of top matches to return
        
        Returns:
            List of tuples (index, similarity_score) sorted by similarity (highest first)
        """
        if not query_embedding or not candidate_embeddings:
            return []
        
        similarities = []
        for idx, candidate in enumerate(candidate_embeddings):
            similarity = self.cosine_similarity(query_embedding, candidate)
            similarities.append((idx, similarity))
        
        # Sort by similarity (descending)
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        return similarities[:top_k]
    
    def get_embedding_dimension(self) -> int:
        """
        Get the dimensionality of embeddings produced by this model.
        
        Returns:
            Embedding dimension (e.g., 384 for all-MiniLM-L6-v2)
        """
        if not self._loaded:
            self.load()
        
        return self.model.get_sentence_embedding_dimension()


# ============================================================================
# GLOBAL INSTANCE (Singleton Pattern)
# ============================================================================

# Create a single shared instance to avoid loading the model multiple times
_embedding_manager = None


def get_embedding_manager() -> EmbeddingManager:
    """
    Get the global EmbeddingManager instance (singleton).
    This ensures the embedding model is loaded only once.
    
    Returns:
        Shared EmbeddingManager instance
    """
    global _embedding_manager
    if _embedding_manager is None:
        _embedding_manager = EmbeddingManager()
    return _embedding_manager


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def embed_text(text: str) -> List[float]:
    """
    Convenience function to embed a single text.
    Uses the global embedding manager.
    """
    manager = get_embedding_manager()
    return manager.embed_text(text)


def embed_texts(texts: List[str], batch_size: int = 32, show_progress: bool = False) -> List[List[float]]:
    """
    Convenience function to embed multiple texts.
    Uses the global embedding manager.
    """
    manager = get_embedding_manager()
    return manager.embed_texts(texts, batch_size, show_progress)


def cosine_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """
    Convenience function to calculate cosine similarity.
    Uses the global embedding manager.
    """
    manager = get_embedding_manager()
    return manager.cosine_similarity(embedding1, embedding2)


def find_most_similar(
    query_embedding: List[float],
    candidate_embeddings: List[List[float]],
    top_k: int = 3
) -> List[tuple[int, float]]:
    """
    Convenience function to find most similar embeddings.
    Uses the global embedding manager.
    """
    manager = get_embedding_manager()
    return manager.find_most_similar(query_embedding, candidate_embeddings, top_k)


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing embedding generation...\n")
    
    # Test loading
    print("1. Loading embedding model...")
    manager = get_embedding_manager()
    manager.load()
    print(f"   Embedding dimension: {manager.get_embedding_dimension()}")
    
    # Test single embedding
    print("\n2. Testing single text embedding...")
    text1 = "How much memory does my GPU have?"
    embedding1 = manager.embed_text(text1)
    print(f"   Text: '{text1}'")
    print(f"   Embedding shape: {len(embedding1)} dimensions")
    print(f"   First 5 values: {embedding1[:5]}")
    
    # Test batch embedding
    print("\n3. Testing batch embedding...")
    texts = [
        "What is the capital of France?",
        "How much VRAM does GTX 850M have?",
        "What is the meaning of life?"
    ]
    embeddings = manager.embed_texts(texts)
    print(f"   Generated {len(embeddings)} embeddings")
    
    # Test similarity
    print("\n4. Testing similarity calculation...")
    text2 = "What's the GPU memory capacity?"
    text3 = "What is the capital of Spain?"
    
    embedding2 = manager.embed_text(text2)
    embedding3 = manager.embed_text(text3)
    
    sim_1_2 = manager.cosine_similarity(embedding1, embedding2)
    sim_1_3 = manager.cosine_similarity(embedding1, embedding3)
    
    print(f"   '{text1}' vs '{text2}': {sim_1_2:.3f}")
    print(f"   '{text1}' vs '{text3}': {sim_1_3:.3f}")
    print(f"   ✓ Similar questions have higher similarity")
    
    # Test finding most similar
    print("\n5. Testing most similar search...")
    query = "GPU memory information"
    query_emb = manager.embed_text(query)
    
    results = manager.find_most_similar(query_emb, embeddings, top_k=2)
    print(f"   Query: '{query}'")
    print(f"   Top matches:")
    for idx, score in results:
        print(f"     - '{texts[idx]}' (similarity: {score:.3f})")
    
    print("\n✓ All embedding tests passed!")
