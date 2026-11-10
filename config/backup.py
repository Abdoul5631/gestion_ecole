"""Export / sauvegarde des données (école ou base complète)."""
import json
import os
import shutil
import subprocess
import tempfile
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import FileField, ImageField
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import EcoleAccesPermission, roles_autorises
from rest_framework.response import Response

from config.tenancy import ecole_of, is_plateforme


class SafeEncoder(DjangoJSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _model_rows(qs, exclude_file_fields=True):
    """Sérialise un queryset en liste de dicts (chemins de fichiers, pas le binaire)."""
    model = qs.model
    file_fields = set()
    if exclude_file_fields:
        for f in model._meta.get_fields():
            if isinstance(f, (ImageField, FileField)):
                file_fields.add(f.name)

    rows = []
    for obj in qs.iterator(chunk_size=500):
        data = {}
        for f in model._meta.concrete_fields:
            if f.name in file_fields:
                val = getattr(obj, f.name)
                data[f.name] = str(val) if val else None
                continue
            data[f.name] = f.value_from_object(obj)
        rows.append(data)
    return rows


def _ecole_export_payload(ecole):
    """Données de l'école uniquement (isolation multi-école)."""
    from accounts.models import User
    from caisse.models import DossierScolarite, Paiement, TarifNiveau
    from cours.models import ClasseMatiere, EmploiDuTemps, Enseignant, Matiere
    from eleves.models import AppelJournalier, Eleve, Presence
    from evaluations.models import (
        CalendrierComposition,
        CalendrierExamenBlanc,
        Deliberation,
        Evaluation,
        Note,
        ProgrammeComposition,
        ProgrammeExamenBlanc,
    )
    from notifications.models import Notification, SmsOutbox
    from parametres.models import Parametres
    from scolarite.models import (
        AnneeScolaire,
        Classe,
        Inscription,
        Niveau,
        PassageAnnee,
        ResultatExamenNational,
        Trimestre,
    )

    eid = ecole.id
    tables = {
        'parametres': Parametres.objects.filter(pk=eid),
        'annees_scolaires': AnneeScolaire.objects.filter(ecole_id=eid),
        'niveaux': Niveau.objects.filter(ecole_id=eid),
        'classes': Classe.objects.filter(ecole_id=eid),
        'trimestres': Trimestre.objects.filter(ecole_id=eid),
        'eleves': Eleve.objects.filter(ecole_id=eid),
        'enseignants': Enseignant.objects.filter(ecole_id=eid),
        'matieres': Matiere.objects.filter(ecole_id=eid),
        'classe_matieres': ClasseMatiere.objects.filter(ecole_id=eid),
        'emplois_du_temps': EmploiDuTemps.objects.filter(ecole_id=eid),
        'inscriptions': Inscription.objects.filter(ecole_id=eid),
        'presences': Presence.objects.filter(ecole_id=eid),
        'appels_journaliers': AppelJournalier.objects.filter(ecole_id=eid),
        'evaluations': Evaluation.objects.filter(ecole_id=eid),
        'notes': Note.objects.filter(ecole_id=eid),
        'calendriers_composition': CalendrierComposition.objects.filter(ecole_id=eid),
        'programmes_composition': ProgrammeComposition.objects.filter(ecole_id=eid),
        'calendriers_examen_blanc': CalendrierExamenBlanc.objects.filter(ecole_id=eid),
        'programmes_examen_blanc': ProgrammeExamenBlanc.objects.filter(ecole_id=eid),
        'deliberations': Deliberation.objects.filter(ecole_id=eid),
        'tarifs': TarifNiveau.objects.filter(ecole_id=eid),
        'dossiers_scolarite': DossierScolarite.objects.filter(ecole_id=eid),
        'paiements': Paiement.objects.filter(ecole_id=eid),
        'resultats_examen': ResultatExamenNational.objects.filter(ecole_id=eid),
        'passages_annee': PassageAnnee.objects.filter(ecole_id=eid),
        'notifications': Notification.objects.filter(ecole_id=eid),
        'sms': SmsOutbox.objects.filter(ecole_id=eid),
        'utilisateurs': User.objects.filter(ecole_id=eid),
    }

    data = {}
    for key, qs in tables.items():
        try:
            if key == 'utilisateurs':
                data[key] = [
                    {
                        'id': u.id,
                        'username': u.username,
                        'email': u.email,
                        'role': u.role,
                        'is_active': u.is_active,
                        'ecole_id': u.ecole_id,
                        'eleve_id': u.eleve_id,
                        'enseignant_id': u.enseignant_id,
                    }
                    for u in qs.only(
                        'id', 'username', 'email', 'role', 'is_active',
                        'ecole_id', 'eleve_id', 'enseignant_id',
                    )
                ]
            else:
                data[key] = _model_rows(qs)
        except Exception as exc:
            data[key] = {'_erreur': str(exc)}

    return {
        'export_type': 'ecole',
        'ecole_id': eid,
        'ecole_nom': ecole.nom_ecole,
        'exported_at': timezone.now().isoformat(),
        'tables': data,
    }


def _json_download(payload, filename):
    body = json.dumps(payload, cls=SafeEncoder, ensure_ascii=False, indent=2)
    response = HttpResponse(body, content_type='application/json; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _mysqldump_or_json():
    """Dump complet : mysqldump si disponible, sinon JSON de tous les modèles métier."""
    db = settings.DATABASES['default']
    engine = db.get('ENGINE', '')
    if 'mysql' in engine or 'mariadb' in engine:
        mysqldump = shutil.which('mysqldump')
        if mysqldump:
            try:
                password = db.get('PASSWORD') or ''
                env = os.environ.copy()
                env['MYSQL_PWD'] = password
                cmd = [
                    mysqldump,
                    f"--host={db.get('HOST') or '127.0.0.1'}",
                    f"--port={str(db.get('PORT') or '3306')}",
                    f"--user={db.get('USER') or 'root'}",
                    '--single-transaction',
                    '--routines',
                    '--events',
                    db['NAME'],
                ]
                proc = subprocess.run(cmd, capture_output=True, env=env, check=False)
                if proc.returncode == 0 and proc.stdout:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.sql')
                    tmp.write(proc.stdout)
                    tmp.close()
                    return FileResponse(
                        open(tmp.name, 'rb'),
                        as_attachment=True,
                        filename=f"sauvegarde_complete_{timezone.now().strftime('%Y%m%d_%H%M')}.sql",
                        content_type='application/sql',
                    )
            except Exception:
                pass

    payload = {
        'export_type': 'plateforme_complete',
        'exported_at': timezone.now().isoformat(),
        'tables': {},
    }
    skip_apps = {'admin', 'auth', 'contenttypes', 'sessions', 'token_blacklist'}
    for model in apps.get_models():
        label = f"{model._meta.app_label}.{model._meta.model_name}"
        if model._meta.app_label in skip_apps:
            continue
        try:
            payload['tables'][label] = _model_rows(model.objects.all())
        except Exception as exc:
            payload['tables'][label] = {'_erreur': str(exc)}
    return _json_download(
        payload,
        f"sauvegarde_complete_{timezone.now().strftime('%Y%m%d_%H%M')}.json",
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('ADMIN', 'SUPER_ADMIN')])
def sauvegarde_download(request):
    """
    ADMIN d'école : JSON de son école uniquement.
    SUPER_ADMIN : mysqldump (si dispo) sinon JSON complet.
    """
    user = request.user
    if is_plateforme(user):
        try:
            reponse = _mysqldump_or_json()
            from accounts.journal import noter
            noter('AUTRE', 'Sauvegarde', 'Sauvegarde complète de la plateforme téléchargée')
            return reponse
        except Exception as exc:
            return Response(
                {'detail': f'Échec de la sauvegarde complète : {exc}'},
                status=500,
            )

    if getattr(user, 'role', None) != 'ADMIN':
        return Response(
            {'detail': "Seuls l'administrateur de l'école ou le superadmin peuvent sauvegarder."},
            status=403,
        )

    ecole = ecole_of(user)
    if not ecole:
        return Response({'detail': 'Aucune école associée à votre compte.'}, status=400)

    try:
        payload = _ecole_export_payload(ecole)
        nom = (ecole.nom_ecole or 'ecole').replace(' ', '_')[:40]
        filename = f"sauvegarde_{nom}_{timezone.now().strftime('%Y%m%d_%H%M')}.json"
        return _json_download(payload, filename)
    except Exception as exc:
        return Response({'detail': f'Échec de la sauvegarde : {exc}'}, status=500)
