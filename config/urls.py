from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from eleves.views import EleveViewSet, PresenceViewSet
from scolarite.views import AnneeScolaireViewSet, NiveauViewSet, ClasseViewSet, TrimestreViewSet, InscriptionViewSet
from cours.views import EnseignantViewSet, MatiereViewSet, ClasseMatiereViewSet, EmploiDuTempsViewSet
from evaluations.views import (EvaluationViewSet, NoteViewSet, CalendrierCompositionViewSet, ProgrammeCompositionViewSet,
                               CalendrierExamenBlancViewSet, ProgrammeExamenBlancViewSet, DeliberationViewSet)
from accounts.views import CustomTokenObtainPairView, UserViewSet, me
from parametres.views import ParametresView

router = DefaultRouter()
router.register(r'eleves', EleveViewSet, basename='eleve')
router.register(r'presences', PresenceViewSet, basename='presence')
router.register(r'annees', AnneeScolaireViewSet, basename='anneescolaire')
router.register(r'niveaux', NiveauViewSet, basename='niveau')
router.register(r'classes', ClasseViewSet, basename='classe')
router.register(r'trimestres', TrimestreViewSet, basename='trimestre')
router.register(r'inscriptions', InscriptionViewSet, basename='inscription')
router.register(r'enseignants', EnseignantViewSet, basename='enseignant')
router.register(r'matieres', MatiereViewSet, basename='matiere')
router.register(r'classe-matieres', ClasseMatiereViewSet, basename='classematiere')
router.register(r'emploi-du-temps', EmploiDuTempsViewSet, basename='emploidutemps')
router.register(r'evaluations', EvaluationViewSet, basename='evaluation')
router.register(r'notes', NoteViewSet, basename='note')
router.register(r'calendriers-composition', CalendrierCompositionViewSet, basename='calendriercompo')
router.register(r'programmes-composition', ProgrammeCompositionViewSet, basename='programmecompo')
router.register(r'calendriers-examen-blanc', CalendrierExamenBlancViewSet, basename='calendrierexamenblanc')
router.register(r'programmes-examen-blanc', ProgrammeExamenBlancViewSet, basename='programmeexamenblanc')
router.register(r'deliberations', DeliberationViewSet, basename='deliberation')
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', me, name='me'),
    path('api/parametres/', ParametresView.as_view(), name='parametres'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
