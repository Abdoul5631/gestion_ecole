from django.apps import AppConfig


class CaisseConfig(AppConfig):
    name = 'caisse'
    verbose_name = 'Caisse / Scolarité'

    def ready(self):
        from . import signals  # noqa: F401
