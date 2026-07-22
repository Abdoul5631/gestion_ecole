from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scolarite', '0004_niveau_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='anneescolaire',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='trimestre',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
