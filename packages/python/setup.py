"""
Setup configuration for the Olbrain Python SDK.
"""

from setuptools import setup, find_packages
import os

# Read the README file for the long description
current_dir = os.path.dirname(os.path.abspath(__file__))
readme_path = os.path.join(current_dir, 'README.md')

long_description = ""
if os.path.exists(readme_path):
    with open(readme_path, 'r', encoding='utf-8') as f:
        long_description = f.read()

# Read version from the package
version = "0.3.1"

setup(
    name="olbrain-python-sdk",
    version=version,
    author="Olbrain Team",
    author_email="support@olbrain.com",
    description="Official Python SDK for Olbrain AI agents",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Olbrain/olbrain-sdk",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Internet :: WWW/HTTP :: Dynamic Content",
    ],
    python_requires=">=3.7",
    install_requires=[
        "requests>=2.25.0",
        "urllib3>=1.26.0",
    ],
    extras_require={
        "dev": [
            "pytest>=6.0.0",
            "pytest-asyncio>=0.18.0",
            "pytest-cov>=2.12.0",
            "black>=22.0.0",
            "flake8>=4.0.0",
            "mypy>=0.910",
            "requests-mock>=1.9.0",
        ],
        "async": [
            "aiohttp>=3.8.0",
            "aiofiles>=0.7.0",
        ],
    },
    keywords=[
        "olbrain",
        "ai",
        "agents",
        "chatbot",
        "nlp",
        "artificial intelligence",
        "sdk",
        "api",
        "conversation",
        "streaming"
    ],
    project_urls={
        "Bug Reports": "https://github.com/Olbrain/olbrain-sdk/issues",
        "Source": "https://github.com/Olbrain/olbrain-sdk/tree/main/packages/python",
        "Documentation": "https://docs.olbrain.com/python-sdk",
    },
    include_package_data=True,
    zip_safe=False,
)
