from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import EcoleAccesPermission, roles_autorises
from accounts.roles import ROLES_PERSONNEL, voit_toute_l_ecole
from rest_framework.response import Response
from config.tenancy import scoped, ecole_of


@api_view(["GET"])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('ADMIN', 'ENSEIGNANT', 'ELEVE', 'PARENT', *ROLES_PERSONNEL)])
def dashboard_stats(request):
    """Compteurs légers pour le tableau de bord (évite de charger 8 000+ présences)."""
    from cours.models import Enseignant, Matiere, ClasseMatiere
    from cours.serializers import ClasseMatiereSerializer
    from eleves.models import Eleve, Presence
    from eleves.serializers import EleveSerializer, PresenceSerializer
    from evaluations.models import Evaluation
    from evaluations.serializers import EvaluationSerializer
    from scolarite.models import Classe
    from scolarite.utils import get_annee_active

    user = request.user
    ecole = ecole_of(user)
    annee = get_annee_active(ecole)

    def _eval_qs(qs):
        return qs.select_related(
            "trimestre",
            "classe_matiere__matiere",
            "classe_matiere__classe",
            "classe_matiere__classe__niveau",
        )

    def _pres_qs(qs):
        return qs.select_related("eleve", "classe_matiere__matiere", "classe_matiere__classe__niveau")

    payload = {
        "annee_active": {"id": annee.id, "libelle": annee.libelle} if annee else None,
    }

    if voit_toute_l_ecole(user):
        from scolarite.models import Inscription
        from scolarite.utils import periode_annee
        eleve_qs = scoped(Eleve.objects.filter(is_active=True), user)
        if annee:
            eleve_ids = scoped(Inscription.objects.filter(annee_scolaire=annee), user).values_list("eleve_id", flat=True)
            eleve_qs = eleve_qs.filter(id__in=eleve_ids)
        recent_eleves = eleve_qs.order_by("-id")[:5]
        eval_qs = scoped(Evaluation.objects.all(), user)
        pres_qs = scoped(Presence.objects.all(), user)
        if annee:
            eval_qs = eval_qs.filter(trimestre__annee_scolaire=annee)
            debut, fin = periode_annee(annee)
            if debut and fin:
                pres_qs = pres_qs.filter(date__gte=debut, date__lte=fin)
        recent_evals = _eval_qs(eval_qs).order_by("-date", "-id")[:5]
        recent_pres = _pres_qs(pres_qs).order_by("-date", "-id")[:5]
        total_p = pres_qs.count()
        presents = pres_qs.filter(statut="PRESENT").count()
        payload.update({
            "eleves": eleve_qs.count(),
            "enseignants": scoped(Enseignant.objects.filter(is_active=True), user).count(),
            "classes": scoped(Classe.objects.filter(is_active=True, niveau__is_active=True), user).count(),
            "matieres": scoped(Matiere.objects.filter(is_active=True), user).count(),
            "presence_total": total_p,
            "presence_presents": presents,
            "recent_eleves": EleveSerializer(recent_eleves, many=True).data,
            "recent_evaluations": EvaluationSerializer(recent_evals, many=True).data,
            "recent_presences": PresenceSerializer(recent_pres, many=True).data,
        })
        return Response(payload)

    if user.role == "ENSEIGNANT" and user.enseignant:
        cms = scoped(ClasseMatiere.objects.filter(enseignant=user.enseignant), user).select_related(
            "classe__niveau", "matiere", "enseignant"
        )
        evals = _eval_qs(Evaluation.objects.filter(classe_matiere__in=cms)).order_by("-date", "-id")
        pres = _pres_qs(Presence.objects.filter(classe_matiere__in=cms)).order_by("-date", "-id")
        payload.update({
            "classe_matieres": ClasseMatiereSerializer(cms, many=True).data,
            "evaluations_count": evals.count(),
            "recent_evaluations": EvaluationSerializer(evals[:5], many=True).data,
            "recent_presences": PresenceSerializer(pres[:5], many=True).data,
        })
        return Response(payload)

    return Response(payload)
