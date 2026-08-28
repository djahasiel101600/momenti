"""Serializers. The invitation record is intentionally loose: the wire format
is the editor's flat payload plus reserved identity fields, exactly like the
Node backend's `{...payload, id, owner_email, created_date, updated_date}`."""
from rest_framework import serializers

RESERVED_FIELDS = ("id", "owner_email", "created_date", "updated_date")


def iso_z(value):
    """UTC datetime -> ISO-8601 with a trailing Z (Node toISOString style)."""
    return value.isoformat().replace("+00:00", "Z")


class UserPublicSerializer(serializers.Serializer):
    def to_representation(self, user):
        return {
            "id": str(user.pk),
            "email": user.email,
            "full_name": user.full_name or "",
            "role": user.role or "member",
        }


class InvitationSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        # Accept any JSON object; reserved identity fields are managed by the
        # backend and stripped (Node overwrote them on create/update anyway).
        if not isinstance(data, dict):
            return {"data": {}}
        return {"data": {k: v for k, v in data.items() if k not in RESERVED_FIELDS}}

    def to_representation(self, instance):
        record = dict(instance.data or {})
        record["id"] = str(instance.pk)
        record["owner_email"] = instance.owner_email or ""
        record["created_date"] = iso_z(instance.created_date)
        record["updated_date"] = iso_z(instance.updated_date)
        return record


class RsvpSerializer(serializers.Serializer):
    def to_representation(self, rsvp):
        return {
            "id": str(rsvp.pk),
            "invitation_id": str(rsvp.invitation_id),
            "slug": rsvp.invitation.slug or "",
            "name": rsvp.name,
            "email": rsvp.email,
            "attending": rsvp.attending,
            "guest_count": rsvp.guest_count,
            "message": rsvp.message or "",
            "created_date": iso_z(rsvp.created_date),
        }
