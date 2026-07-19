"""Relational persistence layer (SQLAlchemy).

Stores users, document metadata, chunk locations and chat history.
Vector data lives in the vector store (see ``app.services.vector``);
this layer only holds what needs transactional, queryable storage.
"""
