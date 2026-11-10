"""Comptes des utilisateurs de toutes les écoles, pour le super admin : voir, corriger, changer le mot de passe, suspendre."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErreurValidation
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.journal import noter
from accounts.models import IncidentServeur, JournalAction, User
from accounts.passwords import generer_mot_de_passe_temporaire, revoquer_sessions
from accounts.permissions import IsPlateforme

LIBELLES_ROLES = {'ADMIN': 'Directeur', 'SECRETAIRE': 'Secrétaire', 'COMPTABLE': 'Comptable', 'SURVEILLANT': 'Surveillant', 'COMMUNICATION': 'Responsable du site public',
                  'ENSEIGNANT': 'Enseignant', 'ELEVE': 'Élève', 'PARENT': 'Parent'}
PAR_PAGE = 25


def _nom(u):
    if u.eleve_id:
        return f'{u.eleve.prenom} {u.eleve.nom}'
    if u.enseignant_id and not (u.first_name or u.last_name):
        return u.enseignant.nom
    return f'{u.first_name} {u.last_name}'.strip()


def _resume(u):
    return {
        'id': u.id, 'username': u.username, 'nom': _nom(u), 'role': u.role,
        'role_libelle': LIBELLES_ROLES.get(u.role, u.role),
        'roles_supplementaires': u.roles_supplementaires or [],
        'ecole_id': u.ecole_id, 'ecole': u.ecole.nom_ecole if u.ecole_id else '—',
        'actif': u.is_active, 'derniere_connexion': u.last_login, 'cree_le': u.date_joined,
        'doit_changer_mdp': u.must_change_password,
    }


def _comptes():
    return User.objects.filter(is_plateforme=False).select_related('ecole', 'eleve', 'enseignant')


class ComptesPlateformeView(APIView):
    """GET /api/plateforme/comptes/?q=&ecole=&role=&actif=1|0&page= — tous les comptes, toutes écoles."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        p = request.query_params
        qs = _comptes()
        if p.get('ecole'):
            qs = qs.filter(ecole_id=p['ecole'])
        if p.get('role'):
            qs = qs.filter(Q(role=p['role']) | Q(roles_supplementaires__icontains=p['role']))
        if p.get('actif') in ('1', '0'):
            qs = qs.filter(is_active=p['actif'] == '1')
        q = (p.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
                           | Q(eleve__nom__icontains=q) | Q(eleve__prenom__icontains=q) | Q(eleve__matricule__icontains=q)
                           | Q(enseignant__nom__icontains=q) | Q(enfants__nom__icontains=q) | Q(enfants__prenom__icontains=q)).distinct()
        total = qs.count()
        try:
            page = max(1, int(p.get('page') or 1))
        except ValueError:
            page = 1
        lignes = qs.order_by('ecole__nom_ecole', 'role', 'username')[(page - 1) * PAR_PAGE: page * PAR_PAGE]
        return Response({'count': total, 'page': page, 'par_page': PAR_PAGE, 'results': [_resume(u) for u in lignes]})


class ComptePlateformeView(APIView):
    """GET / PATCH /api/plateforme/comptes/<pk>/ — le détail d'un compte ; corriger nom, e-mail, identifiant, statut."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request, pk):
        u = get_object_or_404(_comptes(), pk=pk)
        data = _resume(u)
        data.update({
            'prenom': u.first_name, 'nom_famille': u.last_name, 'email': u.email,
            'eleve': {'id': u.eleve_id, 'matricule': u.eleve.matricule} if u.eleve_id else None,
            'enfants': [{'id': e.id, 'nom': f'{e.prenom} {e.nom}', 'matricule': e.matricule} for e in u.enfants.all()],
            'actions': [{'date': j.date, 'action': j.get_action_display(), 'objet': ' '.join(x for x in (j.objet_type, j.objet_libelle) if x)}
                        for j in JournalAction.objects.filter(utilisateur=u).order_by('-date')[:12]],
            'incidents_ouverts': IncidentServeur.objects.filter(utilisateur=u, resolu=False).count(),
        })
        return Response(data)

    def patch(self, request, pk):
        u = get_object_or_404(_comptes(), pk=pk)
        d = request.data
        changes = []
        for champ, attr in (('prenom', 'first_name'), ('nom_famille', 'last_name'), ('email', 'email')):
            if champ in d:
                v = str(d.get(champ) or '').strip()[:150]
                if v != getattr(u, attr):
                    setattr(u, attr, v)
                    changes.append(attr)
        if 'username' in d:
            v = str(d.get('username') or '').strip()
            if not v:
                return Response({'username': ["L'identifiant ne peut pas être vide."]}, status=400)
            if v != u.username:
                if User.objects.filter(username__iexact=v).exclude(pk=u.pk).exists():
                    return Response({'username': [f"L'identifiant « {v} » est déjà utilisé."]}, status=400)
                u.username = v[:150]
                changes.append('username')
        if 'actif' in d and bool(d['actif']) != u.is_active:
            if not d['actif'] and not str(d.get('motif') or '').strip():
                return Response({'motif': ['Indiquez le motif de la suspension.']}, status=400)
            u.is_active = bool(d['actif'])
            changes.append('is_active')
        if changes:
            u.save(update_fields=changes)
            if 'is_active' in changes and not u.is_active:
                revoquer_sessions(u)
            libelle = 'suspendu' if ('is_active' in changes and not u.is_active) else ('réactivé' if 'is_active' in changes else 'modifié')
            noter('MODIFICATION', 'Compte', f"Compte {u.username} {libelle} par la plateforme"
                  + (f" — {str(d.get('motif')).strip()}" if d.get('motif') else ''))
        return self.get(request, pk)


class MotDePasseComptePlateformeView(APIView):
    """POST /api/plateforme/comptes/<pk>/mot-de-passe/ {nouveau?} — sans « nouveau » : mot de passe provisoire généré.
    Dans les deux cas, la personne doit en choisir un à sa prochaine connexion, et ses appareils sont déconnectés."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def post(self, request, pk):
        u = get_object_or_404(_comptes(), pk=pk)
        nouveau = str(request.data.get('nouveau') or '')
        genere = not nouveau
        if genere:
            nouveau = generer_mot_de_passe_temporaire()
        else:
            try:
                validate_password(nouveau, u)
            except ErreurValidation as e:
                return Response({'nouveau': [' '.join(e.messages)]}, status=400)
        u.set_password(nouveau)
        u.must_change_password = True
        u.save(update_fields=['password', 'must_change_password'])
        revoquer_sessions(u)
        noter('MODIFICATION', 'Compte', f'Mot de passe de {u.username} changé par la plateforme')
        return Response({'username': u.username, 'mot_de_passe_temporaire': nouveau})
