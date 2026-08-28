"""C-07: the feature store's provisioning one-shot.

The store's content is produced by ``stores/features/provision.py``, which emits SQL and
opens no connection. This component is the half that connects: it runs at deploy time,
applies what that script emits, and exits.
"""
