# Passage d'année + résultats BEPC/BAC + flag redoublant / statut

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('scolarite', '0007_inscription_annee_scolaire'),
        ('eleves', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='inscription',
            name='redoublant',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='inscription',
            name='statut',
            field=models.CharField(
                choices=[('INSCRIT', 'Inscrit'), ('SORTI', 'Sorti'), ('DIPLOME', 'Diplômé')],
                default='INSCRIT',
                max_length=12,
            ),
        ),
        migrations.CreateModel(
            name='ResultatExamenNational',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('examen', models.CharField(choices=[('BEPC', 'BEPC (3ème)'), ('BAC', 'BAC (Terminale)')], max_length=8)),
                ('admis', models.BooleanField(default=True)),
                ('serie_2nde', models.CharField(blank=True, default='', max_length=4)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('annee_scolaire', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='resultats_examen',
                    to='scolarite.anneescolaire',
                )),
                ('eleve', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='resultats_examen',
                    to='eleves.eleve',
                )),
                ('saisi_par', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='resultats_examen_saisis',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'resultat_examen_national',
                'ordering': ['examen', 'eleve__nom'],
                'unique_together': {('eleve', 'annee_scolaire', 'examen')},
            },
        ),
        migrations.CreateModel(
            name='PassageAnnee',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date_lancement', models.DateTimeField(auto_now_add=True)),
                ('admis', models.PositiveIntegerField(default=0)),
                ('redoublants', models.PositiveIntegerField(default=0)),
                ('diplomes', models.PositiveIntegerField(default=0)),
                ('en_attente_examen', models.PositiveIntegerField(default=0)),
                ('ignores', models.PositiveIntegerField(default=0)),
                ('annee_cible', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='passages_cible',
                    to='scolarite.anneescolaire',
                )),
                ('annee_source', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='passages_source',
                    to='scolarite.anneescolaire',
                )),
                ('lance_par', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='passages_lances',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'passage_annee',
                'ordering': ['-date_lancement'],
            },
        ),
    ]
