from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from eleves.views import EleveViewSet, PresenceViewSet
from scolarite.views import (
    AnneeScolaireViewSet, NiveauViewSet,
    TrimestreViewSet, InscriptionViewSet
)
from cours.views import (
    EnseignantViewSet, MatiereViewSet, ClasseMatiereViewSet
)
from evaluations.views import EvaluationViewSet, NoteViewSet

# Création du router
router = DefaultRouter()

# Enregistrement des routes
router.register(r'eleves',        EleveViewSet)
router.register(r'presences',     PresenceViewSet)
router.register(r'annees',        AnneeScolaireViewSet)
router.register(r'niveaux',       NiveauViewSet)
router.register(r'trimestres',    TrimestreViewSet)
router.register(r'inscriptions',  InscriptionViewSet)
router.register(r'enseignants',   EnseignantViewSet)
router.register(r'matieres',      MatiereViewSet)
router.register(r'classe-matieres', ClasseMatiereViewSet)
router.register(r'evaluations',   EvaluationViewSet)
router.register(r'notes',         NoteViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
]