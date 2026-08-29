"""Seed the built-in invitation templates (wedding / birthday / gala).

These mirror the TEMPLATES catalog in src/lib/templates.js so the gallery
can serve them from the database. Idempotent via update_or_create.
"""
from django.db import migrations


BUILT_IN_HEADERS = [
    {
        "slug": "wedding",
        "name": "Wedding",
        "tagline": "Editorial · Black Tie",
        "accent_color": "#C58A58",
        "background_color": "#0A0A0A",
        "cover": "/media/a2a00eea3_generated_131f7848.png",
    },
    {
        "slug": "birthday",
        "name": "Birthday",
        "tagline": "Celebratory · Candlelit",
        "accent_color": "#C98F7A",
        "background_color": "#0A0A0A",
        "cover": "/media/9ac854455_generated_image.png",
    },
    {
        "slug": "gala",
        "name": "Gala",
        "tagline": "Corporate · Champagne",
        "accent_color": "#B89968",
        "background_color": "#0A0A0A",
        "cover": "/media/900c8128a_generated_image.png",
    },
]


def _payload_for(slug):
    """Return the full invitation payload for a built-in template."""
    common = {
        "heroImageMobile": "",
        "countdownVisible": True,
        "heroKicker": "",
        "heroSubline": "",
        "timeNote": "",
        "dressCodeNote": "",
        "detailsNote": "",
        "rsvpNote": "",
        "rsvpMaxGuests": "5",
        "headings": {},
        "sections": [
            {"id": "countdown", "label": "Countdown", "visible": True},
            {"id": "story", "label": "Our Story", "visible": True},
            {"id": "details", "label": "Details", "visible": True},
            {"id": "gallery", "label": "Gallery", "visible": True},
            {"id": "rsvp", "label": "RSVP", "visible": True},
        ],
        "sectionStyles": {},
        "music": {"url": "", "autoplay": True, "loop": True},
        "loopTransition": "cut",
    }
    if slug == "wedding":
        return {
            **common,
            "template": "wedding",
            "couple": "John & Jane",
            "coupleShort": "J & J",
            "eventType": "Wedding",
            "date": "2027-06-15T17:00",
            "venueName": "The Grand Ballroom",
            "venueAddress": "123 Main St, New York, NY",
            "mapUrl": "https://maps.google.com/?q=The+Grand+Ballroom+New+York",
            "time": "5:00 PM",
            "dressCode": "Black Tie Optional",
            "story": "It began with a glance across a crowded room.",
            "heroImage": "/media/a2a00eea3_generated_131f7848.png",
            "storyImage": "/media/acb2ce145_generated_60229421.png",
            "gallery": [
                {"url": "/media/acb2ce145_generated_60229421.png", "caption": ""},
                {"url": "/media/a2a00eea3_generated_131f7848.png", "caption": ""},
            ],
            "accentColor": "#C58A58",
            "backgroundColor": "#0A0A0A",
            "theme": {"textColor": "#F2F0ED", "paperColor": "#F2F0ED", "displayFont": "serif"},
        }
    if slug == "birthday":
        return {
            **common,
            "template": "birthday",
            "couple": "Eleanor",
            "coupleShort": "E·30",
            "eventType": "Birthday Soirée",
            "date": "2027-09-19T19:30",
            "venueName": "The Rooftop Garden",
            "venueAddress": "88 Skyline Ave, San Francisco, CA",
            "mapUrl": "https://maps.google.com/?q=The+Rooftop+Garden+San+Francisco",
            "time": "7:30 PM",
            "dressCode": "Cocktail Festive",
            "story": "Thirty years of laughter, lessons, and the people who made it all worthwhile.",
            "heroImage": "/media/9ac854455_generated_image.png",
            "storyImage": "/media/815151d2f_generated_image.png",
            "gallery": [
                {"url": "/media/815151d2f_generated_image.png", "caption": ""},
                {"url": "/media/9ac854455_generated_image.png", "caption": ""},
            ],
            "accentColor": "#C98F7A",
            "backgroundColor": "#0A0A0A",
            "theme": {"textColor": "#F6EFEA", "paperColor": "#F6EFEA", "displayFont": "serif"},
        }
    # gala
    return {
        **common,
        "template": "gala",
        "couple": "The Hartwell Foundation",
        "coupleShort": "H·F",
        "eventType": "Annual Gala",
        "date": "2027-11-12T20:00",
        "venueName": "The Astor Ballroom",
        "venueAddress": "45 Park Ave, New York, NY",
        "mapUrl": "https://maps.google.com/?q=The+Astor+Ballroom+New+York",
        "time": "8:00 PM",
        "dressCode": "Black Tie",
        "story": "Once a year, the city's most generous hearts gather under one gilded roof.",
        "heroImage": "/media/900c8128a_generated_image.png",
        "storyImage": "/media/f00f48add_generated_image.png",
        "gallery": [
            {"url": "/media/f00f48add_generated_image.png", "caption": ""},
            {"url": "/media/900c8128a_generated_image.png", "caption": ""},
        ],
        "accentColor": "#B89968",
        "backgroundColor": "#0A0A0A",
        "theme": {"textColor": "#F4F1E8", "paperColor": "#F4F1E8", "displayFont": "serif"},
    }


def seed_templates(apps, schema_editor):
    Template = apps.get_model("core", "Template")
    for header in BUILT_IN_HEADERS:
        Template.objects.update_or_create(
            slug=header["slug"],
            defaults={
                **header,
                "source": "built-in",
                "payload": _payload_for(header["slug"]),
            },
        )


def unseed_templates(apps, schema_editor):
    Template = apps.get_model("core", "Template")
    Template.objects.filter(source="built-in").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_template"),
    ]

    operations = [
        migrations.RunPython(seed_templates, unseed_templates),
    ]
