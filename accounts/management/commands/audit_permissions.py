"""Affiche la matrice des droits d'accès : qui peut appeler quoi."""
import json

from django.core.management.base import BaseCommand

from accounts.audit import matrice_permissions


class Command(BaseCommand):
    help = "Matrice des droits d'accès de l'API (rôle × point d'accès)."

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='Sortie JSON (pour le test de non-régression).')

    def handle(self, *args, **options):
        m = matrice_permissions()
        if options['json']:
            self.stdout.write(json.dumps(m, ensure_ascii=False, indent=1, sort_keys=True))
            return
        court = {'ANONYME': 'ANO', 'ELEVE': 'ELE', 'PARENT': 'PAR', 'ENSEIGNANT': 'ENS', 'ADMIN': 'ADM', 'SUPER_ADMIN': 'SUP',
                 'SECRETAIRE': 'SEC', 'COMPTABLE': 'CPT', 'SURVEILLANT': 'SUR', 'COMMUNICATION': 'COM'}
        for cle, roles in m.items():
            self.stdout.write(f"{' '.join(court.get(r, r[:3]) for r in roles) or '-':<32} {cle}")
