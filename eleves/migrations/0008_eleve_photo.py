# Generated manually for Eleve.photo

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eleves', '0007_appeljournalier'),
    ]

    operations = [
        migrations.AddField(
            model_name='eleve',
            name='photo',
            field=models.ImageField(blank=True, null=True, upload_to='photos_eleves/'),
        ),
    ]
