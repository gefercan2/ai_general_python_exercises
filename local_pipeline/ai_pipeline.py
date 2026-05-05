"""
AI query pipeline for the Unified Local AI System.

Implements the full pipeline:
1. Check correction memory for known answers
2. Retrieve relevant context from RAG
3. Route question to appropriate model
4. Generate answer with worker model
5. Critique answer quality
6. Retry with fallback model if needed
7. Return answer with sources
"""

from typing import Dict, Any, Optional, List, Tuple
from enum import Enum

from core.config import (
    MODE_MODELS,
    FALLBACK_MAP,
    RAG_TOP_K,
    MAX_RETRIES,
    CRITIQUE_PASS_KEYWORDS,
    CRITIQUE_FAIL_KEYWORDS,
    MEMORY_SIMILARITY_THRESHOLD
)
from core.models import ModelManager
from services import create_correction_memory, create_vector_store


class QueryMode(Enum):
    """Query processing modes."""
    SMOLLM_ONLY = 1      # Fast general questions
    QWEN_ONLY = 2        # Code and multilingual
    FULL_PIPELINE = 3    # Route → Work → Critique
    TINYLLAMA_ONLY = 4   # Fastest, simple lookups


class PipelineResult:
    """Container for pipeline execution results."""
    
    def __init__(self):
        self.answer: str = ""
        self.sources: List[Dict[str, Any]] = []
        self.model_used: str = ""
        self.mode: Optional[QueryMode] = None
        self.memory_hit: bool = False
        self.memory_similarity: float = 0.0
        self.rag_used: bool = False
        self.rag_chunks: int = 0
        self.critique_passed: bool = False
        self.retries: int = 0
        self.route_category: Optional[str] = None
        self.execution_path: List[str] = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'answer': self.answer,
            'sources': self.sources,
            'model_used': self.model_used,
            'mode': self.mode.value if self.mode else None,
            'memory_hit': self.memory_hit,
            'memory_similarity': self.memory_similarity,
            'rag_used': self.rag_used,
            'rag_chunks': self.rag_chunks,
            'critique_passed': self.critique_passed,
            'retries': self.retries,
            'route_category': self.route_category,
            'execution_path': self.execution_path
        }


class AIPipeline:
    """
    Manages the full AI query pipeline with multiple models,
    correction memory, RAG, routing, and critique.
    """
    
    def __init__(
        self,
        use_rag: bool = True,
        use_memory: bool = True,
        mode: QueryMode = QueryMode.FULL_PIPELINE
    ):
        """
        Initialize the AI pipeline.
        
        Args:
            use_rag: Whether to use RAG for context retrieval
            use_memory: Whether to check correction memory
            mode: Query processing mode
        """
        self.use_rag = use_rag
        self.use_memory = use_memory
        self.mode = mode
        
        # Initialize services
        self.model_manager = ModelManager()
        self.correction_memory = create_correction_memory() if use_memory else None
        self.vector_store = create_vector_store() if use_rag else None
    
    def query(self, question: str) -> PipelineResult:
        """
        Process a question through the full pipeline.
        
        Args:
            question: User's question
        
        Returns:
            PipelineResult with answer and metadata
        """
        result = PipelineResult()
        result.mode = self.mode
        result.execution_path.append("START")
        
        # Step 1: Check correction memory
        if self.use_memory and self.correction_memory:
            result.execution_path.append("memory_check")
            found, answer, similarity = self.correction_memory.check_memory(
                question,
                threshold=MEMORY_SIMILARITY_THRESHOLD
            )
            
            if found:
                result.answer = answer
                result.memory_hit = True
                result.memory_similarity = similarity
                result.execution_path.append("memory_hit → RETURN")
                return result
        
        # Step 2: Retrieve RAG context
        rag_context = ""
        if self.use_rag and self.vector_store:
            result.execution_path.append("rag_retrieval")
            rag_results = self.vector_store.query(question, top_k=RAG_TOP_K)
            
            if rag_results:
                result.rag_used = True
                result.rag_chunks = len(rag_results)
                result.sources = rag_results
                
                # Build context string
                context_parts = []
                for i, doc in enumerate(rag_results, 1):
                    context_parts.append(f"[{i}] {doc['text']}")
                
                rag_context = "\n\n".join(context_parts)
                result.execution_path.append(f"rag_found_{len(rag_results)}_chunks")
        
        # Step 3: Route to appropriate processing mode
        if self.mode == QueryMode.SMOLLM_ONLY:
            result.execution_path.append("mode_1_smollm")
            answer, model_used = self._process_with_model("smollm", question, rag_context)
            result.answer = answer
            result.model_used = model_used
            result.critique_passed = True  # Skip critique in direct mode
        
        elif self.mode == QueryMode.QWEN_ONLY:
            result.execution_path.append("mode_2_qwen")
            answer, model_used = self._process_with_model("qwen", question, rag_context)
            result.answer = answer
            result.model_used = model_used
            result.critique_passed = True  # Skip critique in direct mode
        
        elif self.mode == QueryMode.TINYLLAMA_ONLY:
            result.execution_path.append("mode_4_tinyllama")
            answer, model_used = self._process_with_model("tinyllama", question, rag_context)
            result.answer = answer
            result.model_used = model_used
            result.critique_passed = True  # Skip critique in direct mode
        
        elif self.mode == QueryMode.FULL_PIPELINE:
            result.execution_path.append("mode_3_full_pipeline")
            self._process_full_pipeline(question, rag_context, result)
        
        result.execution_path.append("END")
        return result
    
    def _process_full_pipeline(
        self,
        question: str,
        rag_context: str,
        result: PipelineResult
    ):
        """
        Run the full pipeline: route → work → critique → retry.
        
        Args:
            question: User's question
            rag_context: Retrieved RAG context
            result: PipelineResult to populate
        """
        # Route the question
        result.execution_path.append("routing")
        category = self.model_manager.route_question(question)
        result.route_category = category
        result.execution_path.append(f"routed_to_{category}")
        
        # Select primary model based on route
        if category == "CODE":
            primary_model = "qwen"
        elif category == "MULTILINGUAL":
            primary_model = "qwen"
        else:  # GENERAL
            primary_model = "smollm"
        
        # Try primary model with retry loop
        for attempt in range(MAX_RETRIES + 1):
            if attempt > 0:
                result.retries += 1
                # Switch to fallback model
                current_model = FALLBACK_MAP.get(primary_model, "smollm")
                result.execution_path.append(f"retry_{attempt}_with_{current_model}")
            else:
                current_model = primary_model
                result.execution_path.append(f"attempt_1_with_{current_model}")
            
            # Generate answer
            answer, model_used = self._process_with_model(
                current_model,
                question,
                rag_context
            )
            
            result.model_used = model_used
            
            # Critique the answer
            result.execution_path.append("critiquing")
            critique = self.model_manager.critique_answer(question, answer)
            
            if critique['passes']:
                result.answer = answer
                result.critique_passed = True
                result.execution_path.append("critique_passed")
                return
            else:
                result.execution_path.append(f"critique_failed: {critique['reason'][:50]}")
                # Continue to retry
        
        # Max retries exhausted, return last answer (flagged as unverified)
        result.answer = answer
        result.critique_passed = False
        result.execution_path.append("max_retries_exhausted")
    
    def _process_with_model(
        self,
        model_key: str,
        question: str,
        rag_context: str
    ) -> Tuple[str, str]:
        """
        Process question with a specific model.
        
        Args:
            model_key: Model identifier ('smollm', 'qwen', 'tinyllama')
            question: User's question
            rag_context: RAG context to include
        
        Returns:
            Tuple of (answer, model_name)
        """
        # Build prompt
        if rag_context:
            prompt = f"""Based on the following context, answer the question.

Context:
{rag_context}

Question: {question}

Answer:"""
        else:
            prompt = question
        
        # Get model and invoke
        model = self.model_manager.get_ollama(model_key)
        if model is None:
            return "Error: Model not available", model_key
        
        try:
            answer = model.invoke(prompt)
            return answer, model_key
        except Exception as e:
            return f"Error generating response: {e}", model_key
    
    def add_correction(
        self,
        question: str,
        wrong_answer: str,
        correct_answer: str,
        model_used: str
    ) -> bool:
        """
        Add a correction to memory.
        
        Args:
            question: Original question
            wrong_answer: Incorrect answer
            correct_answer: Correct answer
            model_used: Model that gave wrong answer
        
        Returns:
            True if successfully saved
        """
        if not self.correction_memory:
            return False
        
        metadata = {
            'model': model_used,
            'mode': self.mode.value
        }
        
        return self.correction_memory.add_correction(
            question=question,
            wrong_answer=wrong_answer,
            correct_answer=correct_answer,
            metadata=metadata
        )
    
    def set_mode(self, mode: QueryMode):
        """Change the query processing mode."""
        self.mode = mode
    
    def toggle_rag(self):
        """Toggle RAG on/off."""
        self.use_rag = not self.use_rag
    
    def toggle_memory(self):
        """Toggle correction memory on/off."""
        self.use_memory = not self.use_memory
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current pipeline status.
        
        Returns:
            Dictionary with configuration and stats
        """
        status = {
            'mode': self.mode.name,
            'rag_enabled': self.use_rag,
            'memory_enabled': self.use_memory,
        }
        
        if self.use_rag and self.vector_store:
            status['rag_chunks'] = self.vector_store.count()
            status['rag_sources'] = len(self.vector_store.get_sources())
        
        if self.use_memory and self.correction_memory:
            status['corrections_count'] = self.correction_memory.count()
        
        return status


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def create_pipeline(
    use_rag: bool = True,
    use_memory: bool = True,
    mode: QueryMode = QueryMode.FULL_PIPELINE
) -> AIPipeline:
    """Create an AI pipeline instance."""
    return AIPipeline(use_rag=use_rag, use_memory=use_memory, mode=mode)


def quick_query(question: str, mode: int = 3) -> str:
    """
    Quick query function for simple use cases.
    
    Args:
        question: Question to ask
        mode: Query mode (1-4)
    
    Returns:
        Answer text
    """
    query_mode = QueryMode(mode)
    pipeline = create_pipeline(mode=query_mode)
    result = pipeline.query(question)
    return result.answer


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing AI pipeline...\n")
    
    # Check system readiness
    print("1. Checking system readiness...")
    manager = ModelManager()
    is_ready, issues = manager.check_system_ready()
    
    if not is_ready:
        print("   ⚠️  System not ready:")
        for issue in issues:
            print(f"     - {issue}")
        print("\n   Please ensure Ollama is running and models are pulled:")
        print("     ollama serve")
        print("     ollama pull smollm2:1.7b")
        print("     ollama pull qwen2.5:1.5b")
        print("     ollama pull tinyllama:1.1b")
    else:
        print("   ✓ System ready")
        
        # Test different modes
        test_question = "What is 2 + 2?"
        
        print("\n2. Testing Mode 4 (TinyLlama only - fastest)...")
        pipeline = create_pipeline(mode=QueryMode.TINYLLAMA_ONLY, use_rag=False)
        result = pipeline.query(test_question)
        print(f"   Question: {test_question}")
        print(f"   Answer: {result.answer[:100]}...")
        print(f"   Model: {result.model_used}")
        print(f"   Path: {' → '.join(result.execution_path)}")
        
        print("\n3. Testing Mode 1 (SmolLM only)...")
        pipeline.set_mode(QueryMode.SMOLLM_ONLY)
        result = pipeline.query(test_question)
        print(f"   Answer: {result.answer[:100]}...")
        print(f"   Model: {result.model_used}")
        
        print("\n4. Testing pipeline status...")
        status = pipeline.get_status()
        for key, value in status.items():
            print(f"   {key}: {value}")
        
        print("\n5. Testing correction memory...")
        # Add a test correction
        pipeline.use_memory = True
        pipeline.correction_memory = create_correction_memory()
        
        success = pipeline.add_correction(
            question="What is the capital of Australia?",
            wrong_answer="Sydney",
            correct_answer="Canberra is the capital of Australia.",
            model_used="smollm"
        )
        
        if success:
            print("   ✓ Correction added")
            
            # Try querying with a similar question
            similar_question = "Where is Australia's capital?"
            result = pipeline.query(similar_question)
            
            if result.memory_hit:
                print(f"   ✓ Memory hit! (similarity: {result.memory_similarity:.2f})")
                print(f"   Answer: {result.answer}")
            else:
                print("   ○ No memory hit")
        
        print("\n6. Testing result serialization...")
        result_dict = result.to_dict()
        print(f"   Keys: {list(result_dict.keys())}")
    
    print("\n✓ AI pipeline tests completed!")
