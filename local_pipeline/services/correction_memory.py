"""
Correction memory service for the Unified Local AI System.

Stores human-verified corrections and retrieves them based on semantic similarity.
This allows the system to bypass model calls when similar questions have been
corrected before, ensuring consistent and accurate responses.
"""

import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

from core.config import (
    CORRECTIONS_FILE,
    MEMORY_SIMILARITY_THRESHOLD,
    MAX_CORRECTIONS
)
from core.embeddings import get_embedding_manager


class CorrectionMemory:
    """
    Manages storage and retrieval of human-verified corrections.
    Uses semantic similarity to match questions to previously corrected answers.
    """
    
    def __init__(self, filepath: Path = CORRECTIONS_FILE):
        """
        Initialize the correction memory.
        
        Args:
            filepath: Path to the corrections JSON file
        """
        self.filepath = filepath
        self.corrections: List[Dict[str, Any]] = []
        self.embedding_manager = get_embedding_manager()
        self._loaded = False
    
    def load(self):
        """Load corrections from disk (lazy loading)."""
        if self._loaded:
            return
        
        if not self.filepath.exists():
            print(f"Creating new corrections file: {self.filepath}")
            self.corrections = []
            self.save()
            self._loaded = True
            return
        
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.corrections = data.get('corrections', [])
            
            print(f"✓ Loaded {len(self.corrections)} corrections from memory")
            self._loaded = True
        
        except Exception as e:
            print(f"⚠️  Error loading corrections: {e}")
            self.corrections = []
            self._loaded = True
    
    def save(self):
        """Save corrections to disk."""
        try:
            data = {
                'corrections': self.corrections,
                'last_updated': datetime.now().isoformat(),
                'count': len(self.corrections)
            }
            
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # print(f"✓ Saved {len(self.corrections)} corrections")
        
        except Exception as e:
            print(f"⚠️  Error saving corrections: {e}")
    
    def add_correction(
        self,
        question: str,
        wrong_answer: str,
        correct_answer: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Add a new correction to memory.
        
        Args:
            question: The original question
            wrong_answer: The incorrect answer that was given
            correct_answer: The human-verified correct answer
            metadata: Optional additional information (model used, timestamp, etc.)
        
        Returns:
            True if successfully added, False otherwise
        """
        if not self._loaded:
            self.load()
        
        # Generate embedding for the question
        embedding = self.embedding_manager.embed_text(question)
        if not embedding:
            print("⚠️  Failed to generate embedding for question")
            return False
        
        # Create correction entry
        correction = {
            'question': question,
            'question_embedding': embedding,
            'wrong_answer': wrong_answer,
            'correct_answer': correct_answer,
            'timestamp': datetime.now().isoformat(),
            'metadata': metadata or {}
        }
        
        # Check if we're at max capacity
        if len(self.corrections) >= MAX_CORRECTIONS:
            # Remove oldest correction
            self.corrections.pop(0)
            print(f"⚠️  Max corrections reached ({MAX_CORRECTIONS}), removed oldest")
        
        # Add to list
        self.corrections.append(correction)
        
        # Save to disk
        self.save()
        
        print(f"✓ Correction saved ({len(self.corrections)} total)")
        return True
    
    def find_similar_question(
        self,
        question: str,
        threshold: float = MEMORY_SIMILARITY_THRESHOLD
    ) -> Optional[Dict[str, Any]]:
        """
        Find if a similar question exists in memory.
        
        Args:
            question: The question to search for
            threshold: Minimum similarity score (0-1)
        
        Returns:
            Dictionary with correction info if found, None otherwise
        """
        if not self._loaded:
            self.load()
        
        if not self.corrections:
            return None
        
        # Generate embedding for query question
        query_embedding = self.embedding_manager.embed_text(question)
        if not query_embedding:
            return None
        
        # Get all stored question embeddings
        stored_embeddings = [c['question_embedding'] for c in self.corrections]
        
        # Find most similar
        results = self.embedding_manager.find_most_similar(
            query_embedding,
            stored_embeddings,
            top_k=1
        )
        
        if not results:
            return None
        
        idx, similarity = results[0]
        
        if similarity >= threshold:
            correction = self.corrections[idx].copy()
            correction['similarity'] = similarity
            return correction
        
        return None
    
    def check_memory(
        self,
        question: str,
        threshold: float = MEMORY_SIMILARITY_THRESHOLD
    ) -> Tuple[bool, Optional[str], Optional[float]]:
        """
        Check if memory has an answer for this question.
        
        Args:
            question: The question to check
            threshold: Minimum similarity threshold
        
        Returns:
            Tuple of (found, answer, similarity_score)
        """
        result = self.find_similar_question(question, threshold)
        
        if result:
            return True, result['correct_answer'], result['similarity']
        
        return False, None, None
    
    def get_all_corrections(self) -> List[Dict[str, Any]]:
        """
        Get all corrections (without embeddings for readability).
        
        Returns:
            List of correction dictionaries
        """
        if not self._loaded:
            self.load()
        
        # Return corrections without embeddings (for display)
        return [
            {
                'question': c['question'],
                'wrong_answer': c['wrong_answer'],
                'correct_answer': c['correct_answer'],
                'timestamp': c['timestamp'],
                'metadata': c.get('metadata', {})
            }
            for c in self.corrections
        ]
    
    def delete_correction(self, index: int) -> bool:
        """
        Delete a correction by index.
        
        Args:
            index: Index of the correction to delete (0-based)
        
        Returns:
            True if deleted, False if index invalid
        """
        if not self._loaded:
            self.load()
        
        if 0 <= index < len(self.corrections):
            deleted = self.corrections.pop(index)
            self.save()
            print(f"✓ Deleted correction for: '{deleted['question'][:50]}...'")
            return True
        
        print(f"⚠️  Invalid index: {index}")
        return False
    
    def clear_all(self):
        """Clear all corrections from memory."""
        if not self._loaded:
            self.load()
        
        self.corrections = []
        self.save()
        print("✓ All corrections cleared")
    
    def count(self) -> int:
        """Get the number of corrections in memory."""
        if not self._loaded:
            self.load()
        return len(self.corrections)
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about the correction memory.
        
        Returns:
            Dictionary with stats
        """
        if not self._loaded:
            self.load()
        
        if not self.corrections:
            return {
                'total_corrections': 0,
                'oldest': None,
                'newest': None
            }
        
        timestamps = [c['timestamp'] for c in self.corrections]
        
        return {
            'total_corrections': len(self.corrections),
            'oldest': min(timestamps),
            'newest': max(timestamps),
            'average_question_length': sum(len(c['question']) for c in self.corrections) / len(self.corrections),
            'average_answer_length': sum(len(c['correct_answer']) for c in self.corrections) / len(self.corrections)
        }
    
    def export_corrections(self, output_path: Path) -> bool:
        """
        Export corrections to a readable text file.
        
        Args:
            output_path: Path to save the export file
        
        Returns:
            True if successful
        """
        if not self._loaded:
            self.load()
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write("CORRECTION MEMORY EXPORT\n")
                f.write("=" * 60 + "\n\n")
                
                for i, correction in enumerate(self.corrections, 1):
                    f.write(f"Correction #{i}\n")
                    f.write(f"Timestamp: {correction['timestamp']}\n")
                    f.write(f"\nQuestion:\n{correction['question']}\n")
                    f.write(f"\nWrong Answer:\n{correction['wrong_answer']}\n")
                    f.write(f"\nCorrect Answer:\n{correction['correct_answer']}\n")
                    f.write("\n" + "-" * 60 + "\n\n")
            
            print(f"✓ Exported {len(self.corrections)} corrections to {output_path}")
            return True
        
        except Exception as e:
            print(f"⚠️  Error exporting corrections: {e}")
            return False


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def create_correction_memory() -> CorrectionMemory:
    """Create and load a correction memory instance."""
    memory = CorrectionMemory()
    memory.load()
    return memory


def check_for_correction(question: str) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Convenience function to check if a question has a known correction.
    
    Args:
        question: The question to check
    
    Returns:
        Tuple of (found, answer, similarity)
    """
    memory = create_correction_memory()
    return memory.check_memory(question)


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing correction memory...\n")
    
    # Create test memory (using a temporary file)
    test_file = Path("test_corrections.json")
    memory = CorrectionMemory(filepath=test_file)
    memory.load()
    
    # Test adding corrections
    print("1. Testing correction addition...")
    
    corrections_to_add = [
        {
            "question": "What is the capital of Australia?",
            "wrong_answer": "Sydney",
            "correct_answer": "Canberra is the capital of Australia, not Sydney.",
            "metadata": {"model": "smollm", "user": "test"}
        },
        {
            "question": "How much memory does GTX 850M have?",
            "wrong_answer": "4GB",
            "correct_answer": "The GTX 850M has 2GB of GDDR5 memory.",
            "metadata": {"model": "qwen"}
        },
        {
            "question": "What year was Python created?",
            "wrong_answer": "1995",
            "correct_answer": "Python was first released in 1991 by Guido van Rossum.",
            "metadata": {"model": "tinyllama"}
        }
    ]
    
    for corr in corrections_to_add:
        memory.add_correction(**corr)
    
    print(f"\nTotal corrections: {memory.count()}")
    
    # Test semantic matching
    print("\n2. Testing semantic similarity matching...")
    
    test_queries = [
        "What's the capital city of Australia?",  # Similar to first correction
        "How much VRAM does the GTX 850M GPU have?",  # Similar to second
        "When was Python programming language invented?",  # Similar to third
        "What is the meaning of life?"  # Should not match
    ]
    
    for query in test_queries:
        print(f"\n   Query: '{query}'")
        found, answer, similarity = memory.check_memory(query)
        
        if found:
            print(f"   ✓ Memory hit! (similarity: {similarity:.3f})")
            print(f"   Answer: {answer[:60]}...")
        else:
            print(f"   ✗ No match found")
    
    # Test statistics
    print("\n3. Testing statistics...")
    stats = memory.get_statistics()
    for key, value in stats.items():
        print(f"   {key}: {value}")
    
    # Test export
    print("\n4. Testing export...")
    export_file = Path("test_export.txt")
    memory.export_corrections(export_file)
    
    # Test listing
    print("\n5. Listing all corrections...")
    all_corrections = memory.get_all_corrections()
    for i, corr in enumerate(all_corrections, 1):
        print(f"\n   [{i}] {corr['question'][:50]}...")
        print(f"       Correct: {corr['correct_answer'][:50]}...")
    
    # Test deletion
    print("\n6. Testing deletion...")
    initial_count = memory.count()
    memory.delete_correction(0)
    print(f"   Corrections: {initial_count} → {memory.count()}")
    
    # Cleanup
    print("\n7. Cleaning up test files...")
    if test_file.exists():
        test_file.unlink()
        print(f"   ✓ Deleted {test_file}")
    if export_file.exists():
        export_file.unlink()
        print(f"   ✓ Deleted {export_file}")
    
    print("\n✓ All correction memory tests completed!")
