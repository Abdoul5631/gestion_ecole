from django.urls import path
from .views import ParametresView

urlpatterns = [
    path('parametres/', ParametresView.as_view(), name='parametres'),
]
