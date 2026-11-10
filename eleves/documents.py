"""Dossier administratif de l'élève : liste, ajout, consultation et suppression des pièces (direction uniquement)."""
import mimetypes
import os

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .models import DocumentEleve

EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
TAILLE_MAX = 8 * 1024 * 1024
PARSERS = [MultiPartParser, FormParser]


class DocumentEleveSerializer(serializers.ModelSerializer):
    type_libelle = serializers.CharField(source='get_type_display', read_only=True)
    est_image = serializers.SerializerMethodField()

    class Meta:
        model = DocumentEleve
        fields = ['id', 'type', 'type_libelle', 'libelle', 'nom_fichier', 'taille', 'date_ajout', 'est_image']

    def get_est_image(self, obj):
        return os.path.splitext(obj.nom_fichier)[1].lower() != '.pdf'


def liste_documents(eleve):
    docs = list(eleve.documents.all())
    fournis = {d.type for d in docs}
    return {
        'documents': DocumentEleveSerializer(docs, many=True).data,
        'types': [{'code': c, 'libelle': l, 'essentiel': c in DocumentEleve.ESSENTIELS, 'fourni': c in fournis}
                  for c, l in DocumentEleve.TYPES],
        'manquants': [l for c, l in DocumentEleve.TYPES if c in DocumentEleve.ESSENTIELS and c not in fournis],
    }


def ajouter_document(request, eleve):
    fichier = request.FILES.get('fichier')
    type_ = request.data.get('type', '')
    if type_ not in dict(DocumentEleve.TYPES):
        return Response({'detail': 'Type de document invalide.'}, status=status.HTTP_400_BAD_REQUEST)
    if fichier is None:
        return Response({'detail': 'Aucun fichier envoyé.'}, status=status.HTTP_400_BAD_REQUEST)
    ext = os.path.splitext(fichier.name)[1].lower()
    if ext not in EXTENSIONS:
        return Response({'detail': 'Format accepté : PDF, JPG, PNG ou WEBP.'}, status=status.HTTP_400_BAD_REQUEST)
    if fichier.size > TAILLE_MAX:
        return Response({'detail': 'Fichier trop lourd (8 Mo maximum).'}, status=status.HTTP_400_BAD_REQUEST)
    doc = DocumentEleve.objects.create(
        eleve=eleve, ecole=eleve.ecole, type=type_, libelle=(request.data.get('libelle') or '')[:150],
        fichier=fichier, nom_fichier=os.path.basename(fichier.name)[:255], taille=fichier.size,
    )
    return Response(DocumentEleveSerializer(doc).data, status=status.HTTP_201_CREATED)


def telecharger_document(eleve, doc_id):
    doc = get_object_or_404(DocumentEleve, pk=doc_id, eleve=eleve)
    try:
        ouvert = doc.fichier.open('rb')
    except FileNotFoundError:
        return Response({'detail': 'Fichier introuvable sur le serveur.'}, status=status.HTTP_404_NOT_FOUND)
    rep = FileResponse(ouvert, content_type=mimetypes.guess_type(doc.nom_fichier)[0] or 'application/octet-stream')
    rep['Content-Disposition'] = f'inline; filename="{doc.nom_fichier}"'
    rep['X-Content-Type-Options'] = 'nosniff'
    return rep


def supprimer_document(eleve, doc_id):
    doc = get_object_or_404(DocumentEleve, pk=doc_id, eleve=eleve)
    doc.fichier.delete(save=False)
    doc.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
