"""
Text analysis module for the Unified Local AI System.

Provides Voyant-style text analysis features:
- Word frequency analysis
- Word clouds
- Keywords in Context (KWIC)
- Corpus statistics

All features run in pure Python with no AI calls (fast on old hardware).
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import Counter
from pathlib import Path
import io

import nltk
from nltk.tokenize import word_tokenize, sent_tokenize
from nltk.corpus import stopwords

# Ensure NLTK data is available
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

from wordcloud import WordCloud
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go

from core.config import (
    STOPWORD_LANGUAGES,
    DEFAULT_STOPWORD_LANG,
    WORD_FREQ_TOP_N,
    WORDCLOUD_WIDTH,
    WORDCLOUD_HEIGHT,
    WORDCLOUD_BACKGROUND,
    KWIC_MAX_RESULTS
)


class TextAnalyzer:
    """
    Performs Voyant-style text analysis on uploaded documents.
    All operations are pure Python (no AI calls).
    """
    
    def __init__(self, text: str, language: str = DEFAULT_STOPWORD_LANG):
        """
        Initialize the text analyzer.
        
        Args:
            text: The text to analyze
            language: Language for stopword filtering
        """
        self.text = text
        self.language = language if language in STOPWORD_LANGUAGES else DEFAULT_STOPWORD_LANG
        
        # Tokenization
        self.tokens = self._tokenize()
        self.sentences = self._get_sentences()
        
        # Stopwords
        self.stop_words = set(stopwords.words(self.language))
        self.filtered_tokens = self._filter_stopwords()
    
    def _tokenize(self) -> List[str]:
        """Tokenize text into words."""
        tokens = word_tokenize(self.text.lower())
        # Keep only alphabetic tokens
        return [t for t in tokens if t.isalpha()]
    
    def _get_sentences(self) -> List[str]:
        """Split text into sentences."""
        return sent_tokenize(self.text)
    
    def _filter_stopwords(self) -> List[str]:
        """Remove stopwords from tokens."""
        return [t for t in self.tokens if t not in self.stop_words]
    
    def get_word_frequency(self, top_n: int = WORD_FREQ_TOP_N) -> List[Tuple[str, int]]:
        """
        Get most frequent words.
        
        Args:
            top_n: Number of top words to return
        
        Returns:
            List of (word, count) tuples
        """
        counter = Counter(self.filtered_tokens)
        return counter.most_common(top_n)
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get corpus statistics.
        
        Returns:
            Dictionary with various statistics
        """
        total_words = len(self.tokens)
        unique_words = len(set(self.tokens))
        total_filtered = len(self.filtered_tokens)
        unique_filtered = len(set(self.filtered_tokens))
        
        return {
            'total_words': total_words,
            'unique_words': unique_words,
            'vocabulary_diversity': round(unique_words / total_words, 3) if total_words > 0 else 0,
            'total_sentences': len(self.sentences),
            'avg_sentence_length': round(total_words / len(self.sentences), 1) if self.sentences else 0,
            'filtered_words': total_filtered,
            'unique_filtered': unique_filtered,
            'stopwords_removed': total_words - total_filtered,
            'character_count': len(self.text),
            'longest_word': max(self.filtered_tokens, key=len) if self.filtered_tokens else "",
            'avg_word_length': round(sum(len(w) for w in self.filtered_tokens) / len(self.filtered_tokens), 1) if self.filtered_tokens else 0
        }
    
    def get_kwic(self, search_term: str, max_results: int = KWIC_MAX_RESULTS) -> List[str]:
        """
        Get Keywords in Context (KWIC) for a search term.
        
        Args:
            search_term: The word or phrase to search for
            max_results: Maximum number of context snippets to return
        
        Returns:
            List of sentences containing the search term
        """
        search_lower = search_term.lower()
        
        # Find sentences containing the term
        matching_sentences = [
            sent for sent in self.sentences
            if search_lower in sent.lower()
        ]
        
        return matching_sentences[:max_results]
    
    def generate_word_cloud_image(self) -> bytes:
        """
        Generate a word cloud image.
        
        Returns:
            PNG image as bytes
        """
        if not self.filtered_tokens:
            # Return empty image if no tokens
            fig, ax = plt.subplots(figsize=(8, 4))
            ax.text(0.5, 0.5, 'No words to display', 
                   ha='center', va='center', fontsize=20)
            ax.axis('off')
            
            buf = io.BytesIO()
            plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
            plt.close()
            buf.seek(0)
            return buf.getvalue()
        
        # Generate word cloud
        text_for_cloud = ' '.join(self.filtered_tokens)
        
        wc = WordCloud(
            width=WORDCLOUD_WIDTH,
            height=WORDCLOUD_HEIGHT,
            background_color=WORDCLOUD_BACKGROUND,
            colormap='viridis',
            max_words=100,
            relative_scaling=0.5
        )
        
        wc.generate(text_for_cloud)
        
        # Convert to image bytes
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.imshow(wc, interpolation='bilinear')
        ax.axis('off')
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        plt.close()
        buf.seek(0)
        
        return buf.getvalue()
    
    def create_frequency_chart(self, top_n: int = WORD_FREQ_TOP_N):
        """
        Create an interactive frequency bar chart using Plotly.
        
        Args:
            top_n: Number of top words to display
        
        Returns:
            Plotly figure object
        """
        freq = self.get_word_frequency(top_n)
        
        if not freq:
            # Empty chart
            fig = go.Figure()
            fig.add_annotation(
                text="No data to display",
                xref="paper", yref="paper",
                x=0.5, y=0.5,
                showarrow=False,
                font=dict(size=20)
            )
            return fig
        
        words, counts = zip(*freq)
        
        fig = px.bar(
            x=list(words),
            y=list(counts),
            labels={'x': 'Word', 'y': 'Frequency'},
            title=f'Top {len(words)} Most Frequent Words'
        )
        
        fig.update_layout(
            xaxis_tickangle=-45,
            showlegend=False,
            height=400
        )
        
        return fig
    
    def create_word_length_distribution(self):
        """
        Create a histogram of word lengths.
        
        Returns:
            Plotly figure object
        """
        if not self.filtered_tokens:
            fig = go.Figure()
            fig.add_annotation(
                text="No data to display",
                xref="paper", yref="paper",
                x=0.5, y=0.5,
                showarrow=False,
                font=dict(size=20)
            )
            return fig
        
        word_lengths = [len(word) for word in self.filtered_tokens]
        
        fig = px.histogram(
            x=word_lengths,
            labels={'x': 'Word Length (characters)', 'y': 'Frequency'},
            title='Word Length Distribution',
            nbins=15
        )
        
        fig.update_layout(
            showlegend=False,
            height=400
        )
        
        return fig
    
    def get_ngrams(self, n: int = 2, top_k: int = 10) -> List[Tuple[str, int]]:
        """
        Get most common n-grams.
        
        Args:
            n: Size of n-gram (2=bigrams, 3=trigrams, etc.)
            top_k: Number of top n-grams to return
        
        Returns:
            List of (n-gram, count) tuples
        """
        if len(self.filtered_tokens) < n:
            return []
        
        ngrams = []
        for i in range(len(self.filtered_tokens) - n + 1):
            ngram = ' '.join(self.filtered_tokens[i:i+n])
            ngrams.append(ngram)
        
        counter = Counter(ngrams)
        return counter.most_common(top_k)


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def analyze_text(text: str, language: str = DEFAULT_STOPWORD_LANG) -> TextAnalyzer:
    """
    Create a TextAnalyzer instance.
    
    Args:
        text: Text to analyze
        language: Language for stopword filtering
    
    Returns:
        TextAnalyzer instance
    """
    return TextAnalyzer(text, language)


def quick_stats(text: str, language: str = DEFAULT_STOPWORD_LANG) -> Dict[str, Any]:
    """
    Get quick statistics for text.
    
    Args:
        text: Text to analyze
        language: Language for stopwords
    
    Returns:
        Statistics dictionary
    """
    analyzer = TextAnalyzer(text, language)
    return analyzer.get_statistics()


def get_top_words(text: str, top_n: int = 20, language: str = DEFAULT_STOPWORD_LANG) -> List[Tuple[str, int]]:
    """
    Get top N most frequent words.
    
    Args:
        text: Text to analyze
        top_n: Number of words to return
        language: Language for stopwords
    
    Returns:
        List of (word, count) tuples
    """
    analyzer = TextAnalyzer(text, language)
    return analyzer.get_word_frequency(top_n)


def search_context(text: str, search_term: str, max_results: int = 10) -> List[str]:
    """
    Get KWIC results for a search term.
    
    Args:
        text: Text to search
        search_term: Term to find
        max_results: Max context snippets
    
    Returns:
        List of matching sentences
    """
    analyzer = TextAnalyzer(text, DEFAULT_STOPWORD_LANG)
    return analyzer.get_kwic(search_term, max_results)


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("Testing text analysis...\n")
    
    # Sample text
    test_text = """
The GTX 850M has 2GB GDDR5 memory and 640 CUDA cores. It was released in 2014
for laptops and has a power consumption of 50W. Training models on this GPU
requires optimization. The GPU memory is limited, so batch sizes must be small.
Machine learning on older hardware is challenging but possible. The GTX 850M
is an older GPU but can still run inference for small models. Memory management
is crucial when working with limited VRAM. The CUDA cores handle parallel
processing efficiently despite the age of the GPU.
"""
    
    # Create analyzer
    print("1. Creating analyzer...")
    analyzer = TextAnalyzer(test_text)
    print(f"   Language: {analyzer.language}")
    print(f"   Total tokens: {len(analyzer.tokens)}")
    print(f"   Filtered tokens: {len(analyzer.filtered_tokens)}")
    
    # Get statistics
    print("\n2. Getting statistics...")
    stats = analyzer.get_statistics()
    for key, value in stats.items():
        print(f"   {key}: {value}")
    
    # Word frequency
    print("\n3. Top 10 words:")
    freq = analyzer.get_word_frequency(10)
    for word, count in freq:
        print(f"   {word}: {count}")
    
    # KWIC
    print("\n4. Keywords in Context (search: 'GPU'):")
    kwic_results = analyzer.get_kwic('GPU', max_results=3)
    for i, sentence in enumerate(kwic_results, 1):
        print(f"   [{i}] {sentence}")
    
    # N-grams
    print("\n5. Top 5 bigrams:")
    bigrams = analyzer.get_ngrams(n=2, top_k=5)
    for ngram, count in bigrams:
        print(f"   '{ngram}': {count}")
    
    # Generate visualizations
    print("\n6. Generating visualizations...")
    
    # Frequency chart
    fig = analyzer.create_frequency_chart(top_n=10)
    print(f"   ✓ Created frequency chart")
    
    # Word cloud
    wc_bytes = analyzer.generate_word_cloud_image()
    print(f"   ✓ Created word cloud ({len(wc_bytes)} bytes)")
    
    # Word length distribution
    length_fig = analyzer.create_word_length_distribution()
    print(f"   ✓ Created length distribution chart")
    
    print("\n✓ All text analysis tests completed!")
